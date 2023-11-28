// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IProxyVault.sol";
import "../interfaces/IFeeRegistry.sol";
import "../interfaces/IFxnGauge.sol";
import "../interfaces/IFxnTokenMinter.sol";
import "../interfaces/IRewards.sol";
import "../interfaces/IPoolRegistry.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

/*
Base class for vaults

*/
contract StakingProxyBase is IProxyVault{
    using SafeERC20 for IERC20;

    address public constant fxn = address(0x365AccFCa291e7D3914637ABf1F7635dB165Bb09);
    address public constant vefxnProxy = address(0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881);
    address public immutable feeRegistry;
    address public immutable poolRegistry;
    address public immutable fxnMinter;

    address public owner; //owner of the vault
    address public gaugeAddress; //gauge contract
    address public stakingToken; //staking token
    address public rewards; //extra rewards on convex
    address public usingProxy; //address of proxy being used
    uint256 public pid;

    uint256 public constant FEE_DENOMINATOR = 10000;

    constructor(address _poolRegistry, address _feeRegistry, address _fxnminter){
        poolRegistry = _poolRegistry;
        feeRegistry = _feeRegistry;
        fxnMinter = _fxnminter;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "!auth");
        _;
    }

    modifier onlyAdmin() {
        require(vefxnProxy == msg.sender, "!auth_admin");
        _;
    }

    //vault type
    function vaultType() external virtual pure returns(VaultType){
        return VaultType.Erc20Basic;
    }

    //vault version
    function vaultVersion() external virtual pure returns(uint256){
        return 1;
    }

    //initialize vault
    function initialize(address _owner, uint256 _pid) public virtual{
        require(owner == address(0),"already init");
        owner = _owner;
        pid = _pid;

        //get pool info
        (,address _gaugeAddress, address _stakingToken, address _convexRewards,) = IPoolRegistry(poolRegistry).poolInfo(_pid);
        gaugeAddress = _gaugeAddress;
        stakingToken = _stakingToken;
        rewards = _convexRewards;

        //set extra rewards to send directly back to owner
        //..could technically save gas on initialize() by using claim(address,address) but
        //since claim is unguarded would be better UX to set receiver in case called by some other address
        IFxnGauge(gaugeAddress).setRewardReceiver(owner);
    }

    //set what veFXN proxy this vault is using
    function setVeFXNProxy(address _proxy) external virtual onlyAdmin{
        //set the vefxn proxy
        _setVeFXNProxy(_proxy);
    }

    //set veFXN proxy the vault is using. call acceptSharedVote to start sharing vefxn proxy's boost
    function _setVeFXNProxy(address _proxyAddress) internal{
        //set proxy address on staking contract
        IFxnGauge(gaugeAddress).acceptSharedVote(_proxyAddress);
        if(_proxyAddress == vefxnProxy){
            //reset back to address 0 to default to convex's proxy, dont write if not needed.
            if(usingProxy != address(0)){
                usingProxy = address(0);
            }
        }else{
            //write non-default proxy address
            usingProxy = _proxyAddress;
        }
    }

    //get rewards and earned are type specific. extend in child class
    function getReward() external virtual{}
    function getReward(bool _claim) external virtual{}
    function getReward(bool _claim, address[] calldata _rewardTokenList) external virtual{}
    function earned() external virtual returns (address[] memory token_addresses, uint256[] memory total_earned){}


    //checkpoint and add/remove weight to convex rewards contract
    function _checkpointRewards() internal{
        //if rewards are active, checkpoint
        if(IRewards(rewards).rewardState() == IRewards.RewardState.Active){
            //get user balance from the gauge
            uint256 userLiq = IFxnGauge(gaugeAddress).balanceOf(address(this));
            //get current balance of reward contract
            uint256 bal = IRewards(rewards).balanceOf(address(this));
            if(userLiq >= bal){
                //add the difference to reward contract
                IRewards(rewards).deposit(owner, userLiq - bal);
            }else{
                //remove the difference from the reward contract
                IRewards(rewards).withdraw(owner, bal - userLiq);
            }
        }
    }

    //apply fees to fxn and send remaining to owner
    function _processFxn() internal{

        //get fee rate from fee registry (only need to know total, let deposit contract disperse itself)
        uint256 totalFees = IFeeRegistry(feeRegistry).totalFees();

        //send fxn fees to fee deposit
        uint256 fxnBalance = IERC20(fxn).balanceOf(address(this));
        uint256 sendAmount = fxnBalance * totalFees / FEE_DENOMINATOR;
        if(sendAmount > 0){
            //get deposit address for given proxy (address 0 will be handled by fee registry to return default convex proxy)
            IERC20(fxn).transfer(IFeeRegistry(feeRegistry).getFeeDepositor(usingProxy), sendAmount);
        }

        //transfer remaining fxn to owner
        sendAmount = IERC20(fxn).balanceOf(address(this));
        if(sendAmount > 0){
            IERC20(fxn).transfer(owner, sendAmount);
        }
    }

    //get extra rewards (convex side)
    function _processExtraRewards() internal{
        if(IRewards(rewards).rewardState() == IRewards.RewardState.Active){
            //update reward balance if this is the first call since reward contract activation:
            //check if no balance recorded yet and set staked balance
            //dont use _checkpointRewards since difference of 0 will still call deposit()
            //as well as it will check rewardState twice
            uint256 bal = IRewards(rewards).balanceOf(address(this));
            uint256 gaugeBalance = IFxnGauge(gaugeAddress).balanceOf(address(this));
            if(bal == 0 && gaugeBalance > 0){
                //set balance to gauge.balanceof(this)
                IRewards(rewards).deposit(owner,gaugeBalance);
            }

            //get the rewards
            IRewards(rewards).getReward(owner);
        }
    }

    //transfer other reward tokens besides fxn(which needs to have fees applied)
    //also block gauge tokens from being transfered out
    function _transferTokens(address[] memory _tokens) internal{
        //transfer all tokens
        for(uint256 i = 0; i < _tokens.length; i++){
            //dont allow fxn (need to take fee)
            //dont allow gauge token transfer
            if(_tokens[i] != fxn && _tokens[i] != gaugeAddress){
                uint256 bal = IERC20(_tokens[i]).balanceOf(address(this));
                if(bal > 0){
                    IERC20(_tokens[i]).safeTransfer(owner, bal);
                }
            }
        }
    }




    //allow arbitrary calls. some function signatures and targets are blocked
    function execute(
        address _to,
        bytes memory _data
    ) external onlyOwner returns (bool, bytes memory) {
        //fully block fxn, staking token(lp etc), and rewards
        require(_to != fxn && _to != stakingToken && _to != rewards, "!invalid target");

        //only allow certain calls to staking(gauge) address
        if(_to == gaugeAddress){
            (, , , , uint8 shutdown) = IPoolRegistry(poolRegistry).poolInfo(pid);
            require(shutdown == 0,"!shutdown");

            // bytes4 sig;
            // assembly {
            //     sig := mload(add(_data, 32))
            // }

            // require(
            //     sig != ISomeInterface.someMethod.selector &&  //seal
            //     sig != ISomeInterface.someMethodB.selector, //seal
            //     "!allowed"
            // );
        }

        (bool success, bytes memory result) = _to.call{value:0}(_data);
        require(success, "!success");
        return (success, result);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IProxyVault.sol";
import "../interfaces/IFeeRegistry.sol";
import "../interfaces/IFxnGauge.sol";
import "../interfaces/IFxnRewardAccumulator.sol";
import "../interfaces/IFxnTokenMinter.sol";
import "../interfaces/IRewards.sol";
import "../interfaces/IPoolRegistry.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


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

    function vaultType() external virtual pure returns(VaultType){
        return VaultType.Erc20Basic;
    }

    function vaultVersion() external virtual pure returns(uint256){
        return 1;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "!auth");
        _;
    }

    modifier onlyAdmin() {
        require(vefxnProxy == msg.sender, "!auth_admin");
        _;
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
        //..could technically save gas by using claim(address,address) but
        //since claim is unguarded would be better UX to set receiver in case called by some other address
        IFxnRewardAccumulator(gaugeAddress).setRewardReceiver(owner);
    }

    function changeRewards(address _rewardsAddress) external onlyAdmin{
        
        //remove from old rewards and claim
        if(IRewards(rewards).active()){
            uint256 bal = IRewards(rewards).balanceOf(address(this));
            if(bal > 0){
                IRewards(rewards).withdraw(owner, bal);
            }
            IRewards(rewards).getReward(owner);
        }

        //set to new rewards
        rewards = _rewardsAddress;

        //update balance
        _checkpointRewards();
    }

    //checkpoint weight on farm
    function checkpointRewards() external onlyAdmin{
        //checkpoint the gauge
        _checkpointGauge();
    }

    function _checkpointGauge() internal{
        //check point
        IFxnGauge(gaugeAddress).user_checkpoint(address(this));
    }

    function setVeFXNProxy(address _proxy) external virtual onlyAdmin{
        //set the vefxn proxy
        _setVeFXNProxy(_proxy);
    }

    function _setVeFXNProxy(address _proxyAddress) internal{
        //set proxy address on staking contract
        IFxnGauge(gaugeAddress).acceptSharedVote(_proxyAddress);
        if(_proxyAddress == vefxnProxy){
            //reset back to address 0
            if(usingProxy != address(0)){
                usingProxy = address(0);
            }
        }else{
            //write non-default proxy address
            usingProxy = _proxyAddress;
        }
    }

    function getReward() external virtual{}
    function getReward(bool _claim) external virtual{}
    function getReward(bool _claim, address[] calldata _rewardTokenList) external virtual{}
    function earned() external virtual returns (address[] memory token_addresses, uint256[] memory total_earned){}


    //checkpoint and add/remove weight to convex rewards contract
    function _checkpointRewards() internal{
        //if rewards are active, checkpoint
        if(IRewards(rewards).active()){
            //using liquidity shares from staking contract will handle rebasing tokens correctly
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

        //get fee rate from fee registry
        uint256 totalFees = IFeeRegistry(feeRegistry).totalFees();

        //send fxn fees to fee deposit
        uint256 fxnBalance = IERC20(fxn).balanceOf(address(this));
        uint256 sendAmount = fxnBalance * totalFees / FEE_DENOMINATOR;
        if(sendAmount > 0){
            //get deposit address for given proxy (address 0 will be handled by fee registry)
            IERC20(fxn).transfer(IFeeRegistry(feeRegistry).getFeeDepositor(usingProxy), sendAmount);
        }

        //transfer remaining fxn to owner
        sendAmount = IERC20(fxn).balanceOf(address(this));
        if(sendAmount > 0){
            IERC20(fxn).transfer(owner, sendAmount);
        }
    }

    //get extra rewards
    function _processExtraRewards() internal{
        if(IRewards(rewards).active()){
            //check if there is a balance because the reward contract could have be activated later
            //dont use _checkpointRewards since difference of 0 will still call deposit() and cost gas
            uint256 bal = IRewards(rewards).balanceOf(address(this));
            uint256 userLiq = IFxnGauge(gaugeAddress).balanceOf(address(this));
            if(bal == 0 && userLiq > 0){
                //bal == 0 and liq > 0 can only happen if rewards were turned on after staking
                IRewards(rewards).deposit(owner,userLiq);
            }
            IRewards(rewards).getReward(owner);
        }
    }

    //transfer other reward tokens besides fxn(which needs to have fees applied)
    function _transferTokens(address[] memory _tokens) internal{
        //transfer all tokens
        for(uint256 i = 0; i < _tokens.length; i++){
            if(_tokens[i] != fxn){
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
        require(_to != fxn && _to != stakingToken && _to != rewards, "!invalid target");

        //only allow certain calls to staking address
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

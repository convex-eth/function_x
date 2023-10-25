// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./StakingProxyBase.sol";
import "../interfaces/IFxnGauge.sol";
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';


contract StakingProxyERC20 is StakingProxyBase, ReentrancyGuard{
    using SafeERC20 for IERC20;

    constructor(address _poolRegistry, address _feeRegistry, address _fxnminter) 
        StakingProxyBase(_poolRegistry, _feeRegistry, _fxnminter){
    }

    function vaultType() external pure override returns(VaultType){
        return VaultType.Erc20Basic;
    }

    function vaultVersion() external pure override returns(uint256){
        return 1;
    }

    //initialize vault
    function initialize(address _owner, uint256 _pid) public override{
        super.initialize(_owner, _pid);

        //set infinite approval
        IERC20(stakingToken).approve(gaugeAddress, type(uint256).max);
    }


    //create a new locked state of _secs timelength
    function deposit(uint256 _amount) external onlyOwner nonReentrant{
        if(_amount > 0){
            //pull tokens from user
            IERC20(stakingToken).safeTransferFrom(msg.sender, address(this), _amount);

            //stake (use balanceof in case of change during transfer)
            IFxnGauge(gaugeAddress).deposit(IERC20(stakingToken).balanceOf(address(this)));
        }
        
        //checkpoint rewards
        _checkpointRewards();
    }


    //withdraw a staked position
    function withdraw(uint256 _amount) external onlyOwner nonReentrant{

        //withdraw directly to owner(msg.sender)
        IFxnGauge(gaugeAddress).withdraw(_amount);

        //checkpoint rewards
        _checkpointRewards();
    }


    //helper function to combine earned tokens on staking contract and any tokens that are on this vault
    function earned() external override returns (address[] memory token_addresses, uint256[] memory total_earned) {
        //get list of reward tokens
        address[] memory rewardTokens = IFxnGauge(gaugeAddress).getActiveRewardTokens();
        uint256[] memory previousBalance = new uint256[](rewardTokens.length);
        token_addresses = new address[](rewardTokens.length + IRewards(rewards).rewardTokenLength() + 1);// +1 for fxn
        total_earned = new uint256[](rewardTokens.length + IRewards(rewards).rewardTokenLength() + 1); // +1 for fxn


        //get previous balances of extra tokens on owner
        for(uint256 i = 0; i < rewardTokens.length; i++){
            previousBalance[i] = IERC20(rewardTokens[i]).balanceOf(owner);
        }
        
        //simulate claiming
        IFxnTokenMinter(fxnMinter).mint(gaugeAddress);
        IFxnGauge(gaugeAddress).claim();

        //check fxn
        token_addresses[0] = fxn;
        total_earned[0] = IERC20(fxn).balanceOf(address(this)) * (FEE_DENOMINATOR - IFeeRegistry(feeRegistry).totalFees()) / FEE_DENOMINATOR;

        //get difference as total earned
        for(uint256 i = 0; i < rewardTokens.length; i++){
            token_addresses[i+1] = rewardTokens[i];
            total_earned[i+1] = IERC20(rewardTokens[i]).balanceOf(owner) - previousBalance[i] + IERC20(rewardTokens[i]).balanceOf(address(this));
        }

        //also add an extra rewards from convex's side
        IRewards.EarnedData[] memory extraRewards = IRewards(rewards).claimableRewards(address(this));
        for(uint256 i = 0; i < extraRewards.length; i++){
            token_addresses[i+rewardTokens.length+1] = extraRewards[i].token;
            total_earned[i+rewardTokens.length+1] = extraRewards[i].amount;
        }
    }

    /*
    claim flow:
        mint fxn rewards directly to vault
        claim extra rewards directly to the owner
        calculate fees on fxn
        distribute fxn between owner and fee deposit
    */
    function getReward() external override{
        getReward(true);
    }

    //get reward with claim option.
    function getReward(bool _claim) public override{

        //claim
        if(_claim){
            //fxn rewards (claim here first then send to user after fees)
            IFxnTokenMinter(fxnMinter).mint(gaugeAddress);

            //extras (will get claimed directly to owner)
            IFxnGauge(gaugeAddress).claim();
        }

        //process fxn fees
        _processFxn();

        //extra rewards
        _processExtraRewards();
    }

    //auxiliary function to supply token list to sweep while claiming
    //can also be used to rescue tokens on the vault
    function getReward(bool _claim, address[] calldata _rewardTokenList) external override{

        //claim
        if(_claim){
            //fxn rewards
            IFxnTokenMinter(fxnMinter).mint(gaugeAddress);

            //extras
            IFxnGauge(gaugeAddress).claim();
        }

        //process fxn fees
        _processFxn();

        //transfer
        _transferTokens(_rewardTokenList);

        //extra rewards
        _processExtraRewards();
    }

}

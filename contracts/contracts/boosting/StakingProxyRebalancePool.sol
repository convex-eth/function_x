// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./StakingProxyBase.sol";
import "../interfaces/IFxnGauge.sol";
import "../interfaces/IFxUsd.sol";
import "../interfaces/IFxFacetV2.sol";
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';

/*
Vault implementation for rebalance pool gauges

This should mostly act like a normal erc20 vault with the exception that
fxn is not minted directly and is rather passed in via the extra rewards route.
Thus automatic redirect must be turned off and processed locally from the vault.
*/
contract StakingProxyRebalancePool is StakingProxyBase, ReentrancyGuard{
    using SafeERC20 for IERC20;

    address public constant fxusd = address(0x085780639CC2cACd35E474e71f4d000e2405d8f6); 

    constructor(address _poolRegistry, address _feeRegistry, address _fxnminter) 
        StakingProxyBase(_poolRegistry, _feeRegistry, _fxnminter){
    }

    //vault type
    function vaultType() external pure override returns(VaultType){
        return VaultType.RebalancePool;
    }

    //vault version
    function vaultVersion() external pure override returns(uint256){
        return 1;
    }

    //initialize vault
    function initialize(address _owner, uint256 _pid) public override{
        super.initialize(_owner, _pid);

        //set infinite approval
        IERC20(stakingToken).approve(gaugeAddress, type(uint256).max);
    }


    //deposit into rebalance pool with ftoken
    function deposit(uint256 _amount) external onlyOwner nonReentrant{
        if(_amount > 0){
            //pull ftokens from user
            IERC20(stakingToken).safeTransferFrom(msg.sender, address(this), _amount);

            //stake
            IFxnGauge(gaugeAddress).deposit(_amount, address(this));
        }
        
        //checkpoint rewards
        _checkpointRewards();
    }

    //deposit into rebalance pool with fxusd
    function depositFxUsd(uint256 _amount) external onlyOwner nonReentrant{
        if(_amount > 0){
            //pull fxusd from user
            IERC20(fxusd).safeTransferFrom(msg.sender, address(this), _amount);

            //stake using fxusd's earn function
            IFxUsd(fxusd).earn(gaugeAddress, _amount, address(this));
        }
        
        //checkpoint rewards
        _checkpointRewards();
    }

    //withdraw a staked position and return ftoken
    function withdraw(uint256 _amount) external onlyOwner nonReentrant{

        //withdraw ftoken directly to owner
        IFxnGauge(gaugeAddress).withdraw(_amount, owner);

        //checkpoint rewards
        _checkpointRewards();
    }

    //withdraw a staked position and return fxusd
    function withdrawFxUsd(uint256 _amount) external onlyOwner nonReentrant{

        //wrap to fxusd and receive at owner(msg.sender)
        IFxUsd(fxusd).wrapFrom(gaugeAddress, _amount, msg.sender);

        //checkpoint rewards
        _checkpointRewards();
    }

    //withdraw from rebalance pool(v2) and return underlying base
    function withdrawAsBase(uint256 _amount, address _fxfacet, address _fxconverter) external onlyOwner nonReentrant{

        //withdraw from rebase pool as underlying
        IFxFacetV2.ConvertOutParams memory params = IFxFacetV2.ConvertOutParams(_fxconverter,0,new uint256[](0));
        IFxFacetV2(_fxfacet).fxRebalancePoolWithdrawAs(params, gaugeAddress, _amount);

        //checkpoint rewards
        _checkpointRewards();
    }

    //return earned tokens on staking contract and any tokens that are on this vault
    function earned() external override returns (address[] memory token_addresses, uint256[] memory total_earned) {
        //get list of reward tokens
        address[] memory rewardTokens = IFxnGauge(gaugeAddress).getActiveRewardTokens();

        //create array of rewards on gauge, rewards on extra reward contract, and fxn that is minted
        address _rewards = rewards;
        token_addresses = new address[](rewardTokens.length + IRewards(_rewards).rewardTokenLength());
        total_earned = new uint256[](rewardTokens.length + IRewards(_rewards).rewardTokenLength());

        //simulate claiming

        //claim other rewards on gauge to this address to tally
        IFxnGauge(gaugeAddress).claim(address(this),address(this));

        //get balance of tokens
        for(uint256 i = 0; i < rewardTokens.length; i++){
            token_addresses[i] = rewardTokens[i];
            if(rewardTokens[i] == fxn){
                //remove boost fee here as boosted fxn is distributed via extra rewards
                total_earned[i] = IERC20(fxn).balanceOf(address(this)) * (FEE_DENOMINATOR - IFeeRegistry(feeRegistry).totalFees()) / FEE_DENOMINATOR;
            }else{
                total_earned[i] = IERC20(rewardTokens[i]).balanceOf(address(this));
            }
        }

        //also add an extra rewards from convex's side
        IRewards.EarnedData[] memory extraRewards = IRewards(_rewards).claimableRewards(address(this));
        for(uint256 i = 0; i < extraRewards.length; i++){
            token_addresses[i+rewardTokens.length] = extraRewards[i].token;
            total_earned[i+rewardTokens.length] = extraRewards[i].amount;
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
            //fxn minting (claim here first then send to user after fees)
            try IFxnTokenMinter(fxnMinter).mint(gaugeAddress){}catch{}

            //extras. rebalance pool will have fxn
            IFxnGauge(gaugeAddress).claim();
        }

        //process fxn fees
        _processFxn();

        //get list of reward tokens
        address[] memory rewardTokens = IFxnGauge(gaugeAddress).getActiveRewardTokens();

        //transfer remaining tokens
        _transferTokens(rewardTokens);

        //extra rewards
        _processExtraRewards();
    }

    //get reward with claim option, as well as a specific token list to claim from convex extra rewards
    function getReward(bool _claim, address[] calldata _tokenList) external override{

        //claim
        if(_claim){
            //fxn rewards
            try IFxnTokenMinter(fxnMinter).mint(gaugeAddress){}catch{}

            //extras
            IFxnGauge(gaugeAddress).claim();
        }

        //process fxn fees
        _processFxn();

        //get list of reward tokens
        address[] memory rewardTokens = IFxnGauge(gaugeAddress).getActiveRewardTokens();

        //transfer remaining tokens
        _transferTokens(rewardTokens);

        //extra rewards
        _processExtraRewardsFilter(_tokenList);
    }

    //return any tokens in vault back to owner
    function transferTokens(address[] calldata _tokenList) external onlyOwner{
        //transfer tokens back to owner
        //fxn and gauge tokens are skipped
        _transferTokens(_tokenList);
    }


    function _checkExecutable(address _address) internal override{
        super._checkExecutable(_address);

        //require shutdown for calls to withdraw role contracts
        if(IFxUsd(gaugeAddress).hasRole(keccak256("WITHDRAW_FROM_ROLE"), _address)){
            (, , , , uint8 shutdown) = IPoolRegistry(poolRegistry).poolInfo(pid);
            require(shutdown == 0,"!shutdown");
        }
    }
}

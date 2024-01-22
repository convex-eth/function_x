// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IFxnToken.sol";
import "../interfaces/IFxnGauge.sol";
import "../interfaces/IGaugeController.sol";
import "../interfaces/IPoolRegistry.sol";
import "../interfaces/IProxyVault.sol";

/*
This is a utility library which is mainly used for off chain calculations
*/
contract PoolUtilities{
    address public constant convexProxy = address(0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881);
    address public constant fxn = address(0x365AccFCa291e7D3914637ABf1F7635dB165Bb09);
    address public constant gaugeController = address(0xe60eB8098B34eD775ac44B1ddE864e098C6d7f37);
    address public immutable poolRegistry;

    constructor(address _poolRegistry){
        poolRegistry = _poolRegistry;
    }

    //get apr with given rates and prices
    function apr(uint256 _rate, uint256 _priceOfReward, uint256 _priceOfDeposit) external pure returns(uint256 _apr){
        return _rate * 365 days * _priceOfReward / _priceOfDeposit; 
    }

    //get rates of each token per deposit for the specified pool id
    function poolRewardRatesById(uint256 _pid) external view returns (address[] memory tokens, uint256[] memory rates) {
        (address _imp, address _gaugeAddress, , ,) = IPoolRegistry(poolRegistry).poolInfo(_pid);
        IProxyVault.VaultType vtype = IProxyVault(_imp).vaultType();
        if(vtype == IProxyVault.VaultType.RebalancePool){
            return rebalancePoolRewardRates(_gaugeAddress);
        }
        return gaugeRewardRates(_gaugeAddress);
    }

    //get rates of each token per deposit for the specified gauge
    function gaugeRewardRates(address _gauge) public view returns (address[] memory tokens, uint256[] memory rates) {
        //get token emission rates and gauge weighting
        uint256 emissionRate = IFxnToken(fxn).rate();
        uint256 gaugeWeight = IGaugeController(gaugeController).gauge_relative_weight(_gauge);

        //get list of reward tokens
        address[] memory rewardTokens = IFxnGauge(_gauge).getActiveRewardTokens();
        rates = new uint256[](rewardTokens.length + 1);
        tokens = new address[](rewardTokens.length + 1);

        //get supplies and deposits
        uint256 gaugeSupply = IFxnGauge(_gauge).totalSupply();
        uint256 gaugeWorkingSupply = IFxnGauge(_gauge).workingSupply();
        uint256 convexWorking = IFxnGauge(_gauge).workingBalanceOf(convexProxy);
        uint256 convexDeposits = IFxnGauge(_gauge).sharedBalanceOf(convexProxy);

        //emission rate per working supply
        if(gaugeWorkingSupply > 0){
            emissionRate = emissionRate * gaugeWeight / gaugeWorkingSupply;
        }else{
            emissionRate = emissionRate * gaugeWeight / 1e18;
        }

        //convex emission rate per deposit for minting fxn
        if(convexDeposits > 0){
            rates[0] = convexWorking * emissionRate / convexDeposits;
        }else{
            rates[0] = emissionRate; //if no deposits, will always be max boost
        }
        tokens[0] = fxn;

        //calc extra rewards (not boosted, ratePerDepost = rate/totalSupply)
        for(uint256 i = 0; i < rewardTokens.length; i++){
            (,uint80 _rate,,uint40 finishAt) = IFxnGauge(_gauge).rewardData(rewardTokens[i]);

            if(block.timestamp <= uint256(finishAt)){
                rates[i+1] = uint256(_rate);
                if(gaugeSupply > 0){
                    rates[i+1] = uint256(_rate) * 1e18 / gaugeSupply;
                }
            }
            tokens[i+1] = rewardTokens[i];
        }
    }

    //get rates of each token per deposit for the specified rebalance pool
    function rebalancePoolRewardRates(address _pool) public view returns (address[] memory tokens, uint256[] memory rates) {
        //get list of reward tokens
        address[] memory rewardTokens = IFxnGauge(_pool).getActiveRewardTokens();
        rates = new uint256[](rewardTokens.length);
        tokens = new address[](rewardTokens.length);

        //get total supply on the pool
        uint256 gaugeSupply = IFxnGauge(_pool).totalSupply();

        //get boost ratio
        uint256 boostRatio = IFxnGauge(_pool).getBoostRatio(convexProxy);

        //calc extra rewards (not boosted, ratePerDepost = rate/totalSupply)
        for(uint256 i = 0; i < rewardTokens.length; i++){
            (,uint80 _rate,,uint40 finishAt) = IFxnGauge(_pool).rewardData(rewardTokens[i]);

            if(block.timestamp <= uint256(finishAt)){
                rates[i] = uint256(_rate);
                if(gaugeSupply > 0){
                    rates[i] = rates[i] * 1e18 / gaugeSupply;
                }
                if(rewardTokens[i] == fxn){
                    rates[i] = rates[i] * boostRatio / 1e18;
                }
            }
            tokens[i] = rewardTokens[i];
        }
    }
}

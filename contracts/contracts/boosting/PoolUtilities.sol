// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IFxnToken.sol";
import "../interfaces/IFxnGauge.sol";
import "../interfaces/IGaugeController.sol";
import "../interfaces/IPoolRegistry.sol";
import "../interfaces/IProxyVault.sol";
import "../interfaces/IVoteEscrow.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/*
This is a utility library which is mainly used for off chain calculations
*/
contract PoolUtilities{
    address public constant convexProxy = address(0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881);
    address public constant fxn = address(0x365AccFCa291e7D3914637ABf1F7635dB165Bb09);
    address public constant vefxn = address(0xEC6B8A3F3605B083F7044C0F31f2cac0caf1d469);
    address public constant gaugeController = address(0xe60eB8098B34eD775ac44B1ddE864e098C6d7f37);
    uint256 internal constant TOKENLESS_PRODUCTION = 40;
    address public immutable poolRegistry;

    constructor(address _poolRegistry){
        poolRegistry = _poolRegistry;
    }

    //get apr with given rates and prices
    function apr(uint256 _rate, uint256 _priceOfReward, uint256 _priceOfDeposit) external pure returns(uint256 _apr){
        return _rate * 365 days * _priceOfReward / _priceOfDeposit; 
    }

    function gaugeWorkingBalance(address _gauge) public view returns (uint256) {
        uint256 _veSupply = IVoteEscrow(vefxn).totalSupply();

        uint256 _supply = IFxnGauge(_gauge).totalSupply();

        // if (_owner == address(0)) _owner = _account;
        uint256 _veBalance = IVoteEscrow(IFxnGauge(_gauge).veProxy()).adjustedVeBalance(convexProxy);
        uint256 _balance = IFxnGauge(_gauge).sharedBalanceOf(convexProxy);
        uint256 _workingBalance = (_balance * TOKENLESS_PRODUCTION) / 100;
        if (_veSupply > 0) {
          _workingBalance += (((_supply * _veBalance) / _veSupply) * (100 - TOKENLESS_PRODUCTION)) / 100;
        }
        if (_workingBalance > _balance) {
          _workingBalance = _balance;
        }

        return _workingBalance;
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
        uint256 convexWorking = gaugeWorkingBalance(_gauge);
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
        uint256 boostRatio = getRebalancePoolBoostRatio(_pool);

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

    //get boost ratio for the specified pool id
    function poolBoostRatioById(uint256 _pid) external view returns (uint256){
        (address _imp, address _gaugeAddress, , ,) = IPoolRegistry(poolRegistry).poolInfo(_pid);
        IProxyVault.VaultType vtype = IProxyVault(_imp).vaultType();
        if(vtype == IProxyVault.VaultType.RebalancePool){
            return getRebalancePoolBoostRatio(_gaugeAddress);
        }
        return getGaugeBoostRatio(_gaugeAddress);
    }

    //get boost ratio of an lp gauge
    function getGaugeBoostRatio(address _gauge) public view returns(uint256){
        //get working and deposits
        uint256 convexWorking = gaugeWorkingBalance(_gauge);
        uint256 convexDeposits = IFxnGauge(_gauge).sharedBalanceOf(convexProxy);

        if(convexDeposits == 0) return 1e18;

        return convexWorking * 1e18 / convexDeposits;
    }

    //get boost ratio of a rebalance pool
    function getRebalancePoolBoostRatio(address _pool) public view returns(uint256){
        //getBoostRatio on the pool is only for a depositing user and not the parent proxy
        //thus we have to calc the boost here
        //working balance = min(balance, balance * 0.4 + 0.6 * veBalance * supply / veSupply) / balance
        uint256 gaugeSupply = IFxnGauge(_pool).totalSupply();
        uint256 vesupply = IERC20(vefxn).totalSupply();
        uint256 vebalance = IERC20(vefxn).balanceOf(convexProxy);

        //if no one is staked, assume full boost
        if(gaugeSupply == 0) return 1e18;

        (, uint256 balance, ) = IFxnGauge(_pool).voteOwnerBalances(convexProxy);
        //if no one is using convex yet, assume full boost
        if(balance == 0) return 1e18;

        //40%
        uint256 boostedBalance = uint256(balance) * 4 / 10;
        // add vebalance ratio up to 60%
        boostedBalance += vebalance * gaugeSupply / vesupply * 6 / 10;

        if(boostedBalance > balance){
            boostedBalance = balance;
        }

        return boostedBalance * 1e18 / balance;
    }
}

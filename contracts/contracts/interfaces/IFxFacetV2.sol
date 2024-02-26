// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IFxFacetV2{

    struct ConvertOutParams {
        address converter;
        uint256 minOut;
        uint256[] routes;
    }

    function fxRebalancePoolWithdraw(address _pool, uint256 _amountIn) external payable returns (uint256 _amountOut);
    function fxRebalancePoolWithdrawAs(
        ConvertOutParams memory _params,
        address _pool,
        uint256 _amountIn
    ) external payable returns (uint256 _amountOut);
}

// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IFxUsd{

    function wrap(
        address _baseToken,
        uint256 _amount,
        address _receiver
      ) external;

    function wrapFrom(
        address _pool,
        uint256 _amount,
        address _receiver
      ) external;

    function mint(
        address _baseToken,
        uint256 _amountIn,
        address _receiver,
        uint256 _minOut
      ) external returns (uint256 _amountOut);


    function earn(
        address _pool,
        uint256 _amount,
        address _receiver
      ) external;

    function mintAndEarn(
        address _pool,
        uint256 _amountIn,
        address _receiver,
        uint256 _minOut
      ) external returns (uint256 _amountOut);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

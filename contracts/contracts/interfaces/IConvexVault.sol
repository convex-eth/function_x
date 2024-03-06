// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IConvexVault {
    function owner() external returns(address);
    function gaugeAddress() external returns(address);
    function stakingToken() external returns(address);
    function rewards() external returns(address);
    function vaultType() external returns(uint256);
    function pid() external returns(uint256);
    function vaultVersion() external returns(uint256);
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _amount) external;
    function getReward() external;
    function transferTokens(address[] calldata _tokenList) external;
}
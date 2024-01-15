// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IProxyVault {

    enum VaultType{
        Erc20Basic,
        RebalancePool
    }

    function initialize(address _owner, uint256 _pid) external;
    function pid() external returns(uint256);
    function usingProxy() external returns(address);
    function owner() external returns(address);
    function gaugeAddress() external returns(address);
    function stakingToken() external returns(address);
    function rewards() external returns(address);
    function getReward() external;
    function getReward(bool _claim) external;
    function getReward(bool _claim, address[] calldata _rewardTokenList) external;
    function earned() external returns (address[] memory token_addresses, uint256[] memory total_earned);
}
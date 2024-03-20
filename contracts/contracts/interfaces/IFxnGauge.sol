// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IFxnGauge{

    //basics
    function stakingToken() external view returns(address);
    function totalSupply() external view returns(uint256);
    function workingSupply() external view returns(uint256);
    function workingBalanceOf(address _account) external view returns(uint256);
    function deposit(uint256 _amount) external;
    function deposit(uint256 _amount, address _receiver) external;
    function deposit(uint256 _amount, address _receiver, bool _manage) external;
    function withdraw(uint256 _amount) external;
    function withdraw(uint256 _amount, address _receiver) external;
    function user_checkpoint(address _account) external returns (bool);
    function balanceOf(address _account) external view returns(uint256);
    function integrate_fraction(address account) external view returns (uint256);
    function baseToken() external view returns(address);
    function asset() external view returns(address);
    function market() external view returns(address);

    //weight sharing
    function toggleVoteSharing(address _staker) external;
    function acceptSharedVote(address _newOwner) external;
    function rejectSharedVote() external;
    function getStakerVoteOwner(address _account) external view returns (address);
    function numAcceptedStakers(address _account) external view returns (uint256);
    function sharedBalanceOf(address _account) external view returns (uint256);
    function veProxy() external view returns(address);

    //rewards
    function rewardData(address _token) external view returns(uint96 queued, uint80 rate, uint40 lastUpdate, uint40 finishAt);
    function getActiveRewardTokens() external view returns (address[] memory _rewardTokens);
    function rewardReceiver(address account) external view returns (address);
    function setRewardReceiver(address _newReceiver) external;
    function claim() external;
    function claim(address account) external;
    function claim(address account, address receiver) external;
    function getBoostRatio(address _account) external view returns (uint256);
    function depositReward(address _token, uint256 _amount) external;
    function voteOwnerBalances(address _account) external view returns(uint112 product, uint104 amount, uint40 updateAt);
}

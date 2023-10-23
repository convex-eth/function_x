// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IFxnGauge{

    // function totalLiquidityLocked() external view returns (uint256);
    // function lockedLiquidityOf(address account) external view returns (uint256);

    // function toggleValidVeFXSProxy(address proxy_address) external;
    // function proxyToggleStaker(address staker_address) external;
    // function stakerSetVeFXSProxy(address proxy_address) external;
    // function getReward(address destination_address) external returns (uint256[] memory);

    //basics
    function stakingToken() external view returns(address);
    function workingSupply() external view returns(uint256);
    function workingBalanceOf(address _account) external view returns(uint256);
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _amount) external;
    function user_checkpoint(address _account) external returns (bool);
    function balanceOf(address _account) external view returns(uint256);
    function integrate_fraction(address account) external view returns (uint256);

    //weight sharing
    function toggleVoteSharing(address _staker) external;
    function acceptSharedVote(address _newOwner) external;
    function rejectSharedVote() external;
    function getStakerVoteOwner(address _account) external view returns (address);
    function numAcceptedStakers(address _account) external view returns (uint256);
    function sharedBalanceOf(address _account) external view returns (uint256);

}

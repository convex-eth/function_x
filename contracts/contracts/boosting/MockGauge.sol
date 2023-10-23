// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


contract MockGauge is ERC20{
    using SafeERC20 for IERC20;

    IERC20 stakingToken;

    constructor(IERC20 _token) ERC20(
            "Gauge Token",
            "gaugeToken"
        ) {
        stakingToken = _token;
    }

    function workingSupply() external view returns(uint256){
        return totalSupply();
    }
    function workingBalanceOf(address _account) external view returns(uint256){
        return balanceOf(_account);
    }
    function user_checkpoint(address) external{

    }
    function integrate_fraction(address) external view returns (uint256){

    }

    function deposit(uint256 _amount) external {
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external{
        _burn(msg.sender, _amount);
        stakingToken.safeTransfer(msg.sender, _amount);
    }

    function claim() external{

    }

    function setRewardReceiver(address) external{
        
    }

    function toggleVoteSharing(address) external{

    }
    function acceptSharedVote(address) external{

    }
    function rejectSharedVote() external{

    }
    function getStakerVoteOwner(address _account) external pure returns (address){
        return _account;
    }
    function numAcceptedStakers(address) external pure returns (uint256){
        return 1;
    }
    function sharedBalanceOf(address _account) external view returns (uint256){
        return balanceOf(_account);
    }
}
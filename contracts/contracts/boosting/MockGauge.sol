// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';


contract MockGauge is ERC20{
    using SafeERC20 for IERC20;

    IERC20 stakingToken;
    mapping(address => address) public redirect;
    mapping(address => uint256) public mintRewards;

    constructor(IERC20 _token) ERC20(
            "Gauge Token",
            "gaugeToken"
        ) {
        stakingToken = _token;
    }

    function rewardData(address) external view returns(uint96 queued, uint80 rate, uint40 lastUpdate, uint40 finishAt){
        queued = 0;
        rate = 1e17;
        lastUpdate = uint40(block.timestamp);
        finishAt = uint40(block.timestamp + 7 days);
    }

    function workingSupply() external view returns(uint256){
        return totalSupply();
    }
    function workingBalanceOf(address _account) external view returns(uint256){
        return balanceOf(_account);
    }
    function user_checkpoint(address _account) external returns(bool){
        mintRewards[_account] += 1e18;
        return true;
    }
    function integrate_fraction(address _account) external view returns (uint256){
        return mintRewards[_account];
    }

    function deposit(uint256 _amount) external {
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external{
        _burn(msg.sender, _amount);
        stakingToken.safeTransfer(msg.sender, _amount);
    }

    function getActiveRewardTokens() external pure returns (address[] memory _rewardTokens){
        _rewardTokens = new address[](3);
        _rewardTokens[0] = address(0x365AccFCa291e7D3914637ABf1F7635dB165Bb09);
        _rewardTokens[1] = address(0xD533a949740bb3306d119CC777fa900bA034cd52);
        _rewardTokens[2] = address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    }

    function claim() external{
        uint256 bal = IERC20(0x365AccFCa291e7D3914637ABf1F7635dB165Bb09).balanceOf(address(this));
        if(bal > 1e18){
            IERC20(0x365AccFCa291e7D3914637ABf1F7635dB165Bb09).transfer(redirect[msg.sender],1e18);
        }

        bal = IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52).balanceOf(address(this));
        if(bal > 1e18){
            IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52).transfer(redirect[msg.sender],1e18);
        }

        bal = IERC20(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B).balanceOf(address(this));
        if(bal > 1e18){
            IERC20(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B).transfer(redirect[msg.sender],1e18);
        }
    }

    function setRewardReceiver(address _redirect) external{
        redirect[msg.sender] = _redirect;
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
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IGaugeController {
    function add_gauge(address,int128,uint256) external;
    function add_type(string calldata, uint256) external;
    function admin() external view returns(address);
    function gauge_relative_weight(address) external view returns(uint256);
}
// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IConvexTreasuryRegistry{

   function addToRegistry(address _address) external;
   function removeFromRegistry(uint256 _index) external;
   function registryLength() external view returns(uint256);
   function registryList() external view returns(address[] memory list);
   function registry(uint256 index) external view returns(address);
   function owner() external view returns(address);
}
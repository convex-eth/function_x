// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IFxClaimer{
    function harvest() external;
    function claim(address _receiver) external;
}

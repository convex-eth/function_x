// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IFxnMarket{

    function mintFToken(
        uint256 _baseIn,
        address _recipient,
        uint256 _minFTokenMinted
      ) external returns (uint256 _fTokenMinted);

    function redeemFToken(
        uint256 _fTokenIn,
        address _recipient,
        uint256 _minBaseOut
      ) external returns (uint256 _baseOut, uint256 _bonus);
}

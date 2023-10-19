// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;



/*
Module that just holds fee information. This allow various contracts to grab required information without
needing a reference to the current "booster" or management contract
*/
contract FeeRegistry{

    address public constant owner = address(0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881);

    uint256 public cvxfxnIncentive = 700;
    uint256 public cvxIncentive = 0;
    uint256 public platformIncentive = 1000;
    uint256 public totalFees = 1700;
    address public feeDeposit;
    uint256 public constant maxFees = 2000;
    uint256 public constant FEE_DENOMINATOR = 10000;


    mapping(address => address) public redirectDepositMap;

    constructor() {}

    /////// Owner Section /////////

    modifier onlyOwner() {
        require(owner == msg.sender, "!auth");
        _;
    }

    //set platform fees
    function setFees(uint256 _cvxfxn, uint256 _cvx, uint256 _platform) external onlyOwner{
        totalFees = _cvxfxn + _cvx + _platform;
        require(totalFees <= maxFees, "fees over");

        cvxfxnIncentive = _cvxfxn;
        cvxIncentive = _cvx;
        platformIncentive = _platform;
    }

    function setDepositAddress(address _deposit) external onlyOwner{
        require(_deposit != address(0),"zero");
        feeDeposit = _deposit;
    }

    function setRedirectDepositAddress(address _from, address _deposit) external onlyOwner{
        redirectDepositMap[_from] = _deposit;
    }

    function getFeeDepositor(address _from) external view returns(address){
        //check if in redirect map
        if(redirectDepositMap[_from] != address(0)){
            return redirectDepositMap[_from];
        }

        //return default
        return feeDeposit;
    }

}
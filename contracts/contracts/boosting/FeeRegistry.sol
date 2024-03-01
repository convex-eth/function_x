// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;



/*
Module that just holds fee information. This allow various contracts to grab required information without
needing a reference to the current "booster" or management contract

Most vaults should just use the default feeDeposit address to send fees to. However the system also allows
custom vault types to override where fees are sent (ex. some collaboration)
*/
contract FeeRegistry{

    //owner is the voteproxy contract holding vefxn
    address public constant owner = address(0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881);

    //fees
    uint256 public totalFees = 1700;
    uint256 public constant maxFees = 2000;
    uint256 public constant FEE_DENOMINATOR = 10000;

    //deposit to send fees to
    address public feeDeposit;
    
    //mapping to allow certain pools to send fees to a different deposit address
    mapping(address => address) public redirectDepositMap;

    constructor() {}

    /////// Owner Section /////////

    modifier onlyOwner() {
        require(owner == msg.sender, "!auth");
        _;
    }

    //set platform fees
    function setFees(uint256 _fees) external onlyOwner{
        require(_fees <= maxFees, "fees over");

        totalFees = _fees;
    }

    //set main deposit address
    function setDepositAddress(address _deposit) external onlyOwner{
        require(_deposit != address(0),"zero");
        feeDeposit = _deposit;
    }

    //set redirect to a given deposit address
    function setRedirectDepositAddress(address _from, address _deposit) external onlyOwner{
        redirectDepositMap[_from] = _deposit;
    }

    //get the current deposit address
    function getFeeDepositor(address _from) external view returns(address){
        //check if in redirect map
        if(redirectDepositMap[_from] != address(0)){
            return redirectDepositMap[_from];
        }

        //return default
        return feeDeposit;
    }

}
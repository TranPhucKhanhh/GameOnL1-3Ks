// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @notice LOCAL TEST TOKEN ONLY. Stands in for Circle test USDC on Fuji during local runs. Never deploy on mainnet.
contract MockUSDC {
    string public constant name = "Local Test USDC (NOT CIRCLE, NO VALUE)";
    string public constant symbol = "tUSDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nextFaucetAt;
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor() {
        _mint(msg.sender, 1_000e6);
    }

    function faucet() external {
        require(block.timestamp >= nextFaucetAt[msg.sender], "FAUCET_COOLDOWN");
        nextFaucetAt[msg.sender] = block.timestamp + 1 hours;
        _mint(msg.sender, 100e6);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ALLOWANCE");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "ZERO_ADDRESS");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}

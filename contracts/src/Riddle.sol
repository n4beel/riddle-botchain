// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Riddle
 * @notice Post a riddle with a prize pool. Solvers commit-reveal their answers.
 * The first three valid reveals win 50% / 30% / 20% of the pool.
 */
contract Riddle {
    // --- Structs ---

    struct Puzzle {
        address creator;
        uint128 pool;
        uint64 deadline;
        bytes32 answerHash;
        uint8 solved;
        bool reclaimed;
        string question;
    }

    // --- Limits & Constants ---

    uint64 public constant MIN_DURATION = 3600; // 1 hour
    uint64 public constant MAX_DURATION = 7776000; // 90 days
    uint256 public constant MAX_QUESTION = 140;

    // --- Storage ---

    mapping(uint256 => Puzzle) private _puzzles;
    mapping(uint256 => mapping(address => bytes32)) private _commit;
    mapping(uint256 => mapping(address => uint64)) private _committedBlock;
    mapping(uint256 => address[3]) private _winners;
    mapping(address => uint256) public pending;
    uint256 public puzzleCount;

    bool private _locked;

    // --- Errors ---

    error NoPrize();
    error PoolTooLarge();
    error BadAnswerHash();
    error BadQuestion();
    error BadDuration();
    error NoSuchPuzzle();
    error Closed();
    error BadCommitment();
    error CreatorCannotSolve();
    error AlreadyCommitted();
    error NoCommitment();
    error TooSoon();
    error BadReveal();
    error WrongAnswer();
    error PrizesTaken();
    error AlreadyWon();
    error OnlyCreator();
    error NotReclaimable();
    error AlreadyReclaimed();
    error NothingToWithdraw();
    error TransferFailed();
    error ReentrancyGuardReentrantCall();

    // --- Events ---

    event Created(
        uint256 indexed id,
        address indexed creator,
        string question,
        bytes32 answerHash,
        uint128 pool,
        uint64 deadline
    );
    event Committed(uint256 indexed id, address indexed solver, uint64 blockNumber);
    event Solved(
        uint256 indexed id,
        address indexed solver,
        uint8 rank,
        uint128 payout,
        string answer
    );
    event Reclaimed(uint256 indexed id, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    // --- Modifiers ---

    modifier nonReentrant() {
        if (_locked) revert ReentrancyGuardReentrantCall();
        _locked = true;
        _;
        _locked = false;
    }

    // --- Core Functions ---

    /**
     * @notice Post a new riddle with question, answer hash, and prize pool.
     */
    function create(
        string calldata question,
        bytes32 answerHash,
        uint64 durationSecs
    ) external payable returns (uint256) {
        if (msg.value == 0) revert NoPrize();
        if (msg.value > type(uint128).max) revert PoolTooLarge();
        if (answerHash == bytes32(0)) revert BadAnswerHash();

        uint256 qLen = bytes(question).length;
        if (qLen == 0 || qLen > MAX_QUESTION) revert BadQuestion();
        if (durationSecs < MIN_DURATION || durationSecs > MAX_DURATION) revert BadDuration();

        puzzleCount++;
        uint256 id = puzzleCount;
        uint64 deadline = uint64(block.timestamp + durationSecs);

        _puzzles[id] = Puzzle({
            creator: msg.sender,
            pool: uint128(msg.value),
            deadline: deadline,
            answerHash: answerHash,
            solved: 0,
            reclaimed: false,
            question: question
        });

        emit Created(id, msg.sender, question, answerHash, uint128(msg.value), deadline);
        return id;
    }

    /**
     * @notice Commit a sealed guess to prevent front-running.
     */
    function commitSolve(uint256 id, bytes32 commitment) external {
        if (id == 0 || id > puzzleCount) revert NoSuchPuzzle();
        Puzzle storage p = _puzzles[id];

        if (block.timestamp >= p.deadline) revert Closed();
        if (commitment == bytes32(0)) revert BadCommitment();
        if (msg.sender == p.creator) revert CreatorCannotSolve();
        if (_commit[id][msg.sender] != bytes32(0)) revert AlreadyCommitted();

        _commit[id][msg.sender] = commitment;
        _committedBlock[id][msg.sender] = uint64(block.number);

        emit Committed(id, msg.sender, uint64(block.number));
    }

    /**
     * @notice Reveal your previously committed guess.
     */
    function reveal(
        uint256 id,
        string memory answer,
        bytes32 salt
    ) external {
        if (id == 0 || id > puzzleCount) revert NoSuchPuzzle();
        Puzzle storage p = _puzzles[id];

        if (block.timestamp >= p.deadline) revert Closed();

        bytes32 storedCommitment = _commit[id][msg.sender];
        if (storedCommitment == bytes32(0)) revert NoCommitment();
        if (block.number <= _committedBlock[id][msg.sender]) revert TooSoon();

        string memory norm = normalize(answer);
        bytes32 computed = keccak256(abi.encode(id, msg.sender, norm, salt));
        if (computed != storedCommitment) revert BadReveal();

        if (keccak256(bytes(norm)) != p.answerHash) revert WrongAnswer();
        if (p.solved >= 3) revert PrizesTaken();

        for (uint8 i = 0; i < p.solved; i++) {
            if (_winners[id][i] == msg.sender) revert AlreadyWon();
        }

        uint8 rank = p.solved;
        uint128 sharePct = rank == 0 ? 50 : (rank == 1 ? 30 : 20);
        uint128 payout = uint128((uint256(p.pool) * sharePct) / 100);

        _winners[id][rank] = msg.sender;
        p.solved++;
        pending[msg.sender] += payout;

        emit Solved(id, msg.sender, rank, payout, norm);
    }

    /**
     * @notice Reclaim leftover prize pool funds after deadline or after all 3 prizes won.
     */
    function reclaim(uint256 id) external {
        if (id == 0 || id > puzzleCount) revert NoSuchPuzzle();
        Puzzle storage p = _puzzles[id];

        if (msg.sender != p.creator) revert OnlyCreator();
        if (block.timestamp < p.deadline && p.solved < 3) revert NotReclaimable();
        if (p.reclaimed) revert AlreadyReclaimed();

        p.reclaimed = true;

        uint128 paid = 0;
        if (p.solved >= 1) paid += uint128((uint256(p.pool) * 50) / 100);
        if (p.solved >= 2) paid += uint128((uint256(p.pool) * 30) / 100);
        if (p.solved >= 3) paid += uint128((uint256(p.pool) * 20) / 100);

        uint128 leftover = p.pool - paid;
        if (leftover > 0) {
            pending[p.creator] += leftover;
        }

        emit Reclaimed(id, leftover);
    }

    /**
     * @notice Pull payment withdrawal for creators and winners.
     */
    function withdraw() external nonReentrant {
        uint256 amt = pending[msg.sender];
        if (amt == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amt}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amt);
    }

    // --- Pure / View Helpers ---

    /**
     * @notice Computes normalized ASCII string: trimmed, lowercased A-Z, collapsed space runs.
     */
    function normalize(string memory input) public pure returns (string memory) {
        bytes memory b = bytes(input);
        uint256 len = b.length;
        if (len == 0) return "";

        // 1. Trim leading ASCII spaces (0x20)
        uint256 start = 0;
        while (start < len && b[start] == 0x20) {
            start++;
        }
        if (start == len) return "";

        // 2. Trim trailing ASCII spaces (0x20)
        uint256 end = len;
        while (end > start && b[end - 1] == 0x20) {
            end--;
        }

        // 3. Process characters, lowercasing A-Z and collapsing whitespace runs
        bytes memory out = new bytes(end - start);
        uint256 outLen = 0;
        bool lastWasSpace = false;

        for (uint256 i = start; i < end; i++) {
            bytes1 c = b[i];
            if (c >= 0x41 && c <= 0x5A) {
                // Uppercase A-Z -> lowercase a-z (+32)
                out[outLen++] = bytes1(uint8(c) + 32);
                lastWasSpace = false;
            } else if (c == 0x20) {
                if (!lastWasSpace) {
                    out[outLen++] = 0x20;
                    lastWasSpace = true;
                }
            } else {
                out[outLen++] = c;
                lastWasSpace = false;
            }
        }

        bytes memory result = new bytes(outLen);
        for (uint256 i = 0; i < outLen; i++) {
            result[i] = out[i];
        }
        return string(result);
    }

    /**
     * @notice Computes a commitment hash for a given solver, answer, and salt.
     */
    function commitmentFor(
        uint256 id,
        address solver,
        string memory answer,
        bytes32 salt
    ) public pure returns (bytes32) {
        string memory norm = normalize(answer);
        return keccak256(abi.encode(id, solver, norm, salt));
    }

    function puzzleOf(uint256 id) external view returns (Puzzle memory) {
        return _puzzles[id];
    }

    function winnersOf(uint256 id) external view returns (address[3] memory) {
        return _winners[id];
    }

    function commitmentOf(uint256 id, address who)
        external
        view
        returns (bytes32 commitment, uint64 committedBlock)
    {
        return (_commit[id][who], _committedBlock[id][who]);
    }

    function latest(uint256 offset, uint256 count)
        external
        view
        returns (
            Puzzle[] memory list,
            uint256[] memory ids,
            uint256 total
        )
    {
        total = puzzleCount;
        if (count > 50) count = 50;
        if (offset >= total) {
            return (new Puzzle[](0), new uint256[](0), total);
        }

        uint256 remaining = total - offset;
        uint256 size = remaining < count ? remaining : count;

        list = new Puzzle[](size);
        ids = new uint256[](size);

        for (uint256 i = 0; i < size; i++) {
            uint256 id = total - offset - i;
            ids[i] = id;
            list[i] = _puzzles[id];
        }
    }
}

export const riddleAbi = [
  // --- Functions ---
  {
    type: "function",
    name: "create",
    stateMutability: "payable",
    inputs: [
      { name: "question", type: "string" },
      { name: "answerHash", type: "bytes32" },
      { name: "durationSecs", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "commitSolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reveal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "answer", type: "string" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reclaim",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "puzzleOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "pool", type: "uint128" },
          { name: "deadline", type: "uint64" },
          { name: "answerHash", type: "bytes32" },
          { name: "solved", type: "uint8" },
          { name: "reclaimed", type: "bool" },
          { name: "question", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "winnersOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "address[3]" }],
  },
  {
    type: "function",
    name: "commitmentOf",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "who", type: "address" },
    ],
    outputs: [
      { name: "commitment", type: "bytes32" },
      { name: "blockNumber", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "puzzleCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pending",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        name: "items",
        type: "tuple[]",
        components: [
          { name: "creator", type: "address" },
          { name: "pool", type: "uint128" },
          { name: "deadline", type: "uint64" },
          { name: "answerHash", type: "bytes32" },
          { name: "solved", type: "uint8" },
          { name: "reclaimed", type: "bool" },
          { name: "question", type: "string" },
        ],
      },
      { name: "ids", type: "uint256[]" },
    ],
  },
  {
    type: "function",
    name: "commitmentFor",
    stateMutability: "pure",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "solver", type: "address" },
      { name: "answer", type: "string" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "normalize",
    stateMutability: "pure",
    inputs: [{ name: "input", type: "string" }],
    outputs: [{ name: "", type: "string" }],
  },

  // --- Events ---
  {
    type: "event",
    name: "Created",
    anonymous: false,
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "answerHash", type: "bytes32", indexed: false },
      { name: "pool", type: "uint128", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Committed",
    anonymous: false,
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "solver", type: "address", indexed: true },
      { name: "blockNumber", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Solved",
    anonymous: false,
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "solver", type: "address", indexed: true },
      { name: "rank", type: "uint8", indexed: false },
      { name: "payout", type: "uint128", indexed: false },
      { name: "answer", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Reclaimed",
    anonymous: false,
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    anonymous: false,
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // --- Errors ---
  { type: "error", name: "NoPrize", inputs: [] },
  { type: "error", name: "BadAnswerHash", inputs: [] },
  { type: "error", name: "BadQuestion", inputs: [] },
  { type: "error", name: "BadDuration", inputs: [] },
  { type: "error", name: "NoSuchPuzzle", inputs: [] },
  { type: "error", name: "Closed", inputs: [] },
  { type: "error", name: "CreatorCannotSolve", inputs: [] },
  { type: "error", name: "BadCommitment", inputs: [] },
  { type: "error", name: "AlreadyCommitted", inputs: [] },
  { type: "error", name: "NoCommitment", inputs: [] },
  { type: "error", name: "TooSoon", inputs: [] },
  { type: "error", name: "BadReveal", inputs: [] },
  { type: "error", name: "WrongAnswer", inputs: [] },
  { type: "error", name: "PrizesTaken", inputs: [] },
  { type: "error", name: "AlreadyWon", inputs: [] },
  { type: "error", name: "OnlyCreator", inputs: [] },
  { type: "error", name: "NotReclaimable", inputs: [] },
  { type: "error", name: "AlreadyReclaimed", inputs: [] },
  { type: "error", name: "NothingToWithdraw", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "PoolTooLarge", inputs: [] },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
] as const;

export const contractAbi = riddleAbi;

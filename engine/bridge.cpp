// Browser adapter for nneonneo/2048-ai. See vendor/2048-ai/LICENSE.
// The upstream move tables, heuristic and expectimax search are included by the build.
typedef unsigned long long uint64_t;
typedef unsigned int uint32_t;
typedef unsigned short uint16_t;
typedef unsigned char uint8_t;
typedef uint64_t board_t;
typedef uint16_t row_t;
namespace std {
  template<typename T> static inline T min(T a, T b) { return a < b ? a : b; }
  template<typename T> static inline T max(T a, T b) { return a > b ? a : b; }
}
extern "C" __attribute__((import_module("env"), import_name("pow"))) double pow(double, double);
static const board_t ROW_MASK = 0xFFFFULL;
static const board_t COL_MASK = 0x000F000F000F000FULL;
struct trans_table_entry_t { uint8_t depth; float heuristic; };

// A fixed-size replacement for unordered_map avoids libc, allocation and GC.
// Key/epoch checks make collisions cache misses; they never reuse another board.
struct cache_entry_t { board_t key; trans_table_entry_t second; uint32_t epoch; };
static cache_entry_t cache[1 << 18];
static uint32_t cache_epoch = 0;
class trans_table_t {
  uint32_t epoch;
  static uint32_t index(board_t key) {
    key ^= key >> 33;
    key *= 0xff51afd7ed558ccdULL;
    key ^= key >> 33;
    return uint32_t(key) & ((1 << 18) - 1);
  }
public:
  typedef cache_entry_t* iterator;
  trans_table_t() : epoch(++cache_epoch) {}
  iterator find(board_t key) {
    cache_entry_t* entry = &cache[index(key)];
    return entry->epoch == epoch && entry->key == key ? entry : nullptr;
  }
  iterator end() { return nullptr; }
  trans_table_entry_t& operator[](board_t key) {
    cache_entry_t& entry = cache[index(key)];
    entry.key = key; entry.epoch = epoch;
    return entry.second;
  }
};
static inline board_t unpack_col(row_t row) {
  board_t tmp = row;
  return (tmp | (tmp << 12ULL) | (tmp << 24ULL) | (tmp << 36ULL)) & COL_MASK;
}
static inline row_t reverse_row(row_t row) {
  return (row >> 12) | ((row >> 4) & 0x00F0) | ((row << 4) & 0x0F00) | (row << 12);
}
#include "upstream-core.inc"

static uint32_t last_nodes;
static int last_depth;
extern "C" void engine_init() { init_tables(); }
extern "C" board_t engine_move(board_t board, int move) { return execute_move(move, board); }
extern "C" float engine_heuristic(board_t board) { return score_heur_board(board); }
extern "C" uint32_t engine_nodes() { return last_nodes; }
extern "C" int engine_depth() { return last_depth; }
extern "C" int engine_choose(board_t board, int maximum_depth) {
  last_nodes = 0;
  last_depth = std::min(std::max(3, maximum_depth), std::max(3, count_distinct_tiles(board) - 2));
  int best_move = -1;
  float best_score = -3.402823466e+38F;
  for (int move = 0; move < 4; move++) {
    if (execute_move(move, board) == board) continue;
    eval_state state;
    state.depth_limit = last_depth;
    float score = _score_toplevel_move(state, board, move);
    last_nodes += state.moves_evaled;
    if (score > best_score) { best_score = score; best_move = move; }
  }
  return best_move;
}

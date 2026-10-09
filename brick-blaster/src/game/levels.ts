// 14 columns per row. Legend:
//   . empty   r o y g c b p w  coloured 1-hit bricks
//   2 3       strong bricks (hits to break)
//   M         metal (unbreakable)
//   X         explosive (destroys neighbours, can chain)
//   ?         mystery (always drops a power-up)

export const COLS = 14;

export const LEVELS: { name: string; rows: string[] }[] = [
  {
    name: "Rainbow",
    rows: ["..............", "rrrrrrrrrrrrrr", "oooooo??oooooo", "yyyyyyyyyyyyyy", "gggggggggggggg", "cccccc??cccccc", "bbbbbbbbbbbbbb"],
  },
  {
    name: "Pyramid",
    rows: ["......pp......", ".....pppp.....", "....b?bb?b....", "...cccccccc...", "..gggg22gggg..", ".yyyyyyyyyyyy.", "oooooo??oooooo", "rrrrrrrrrrrrrr"],
  },
  {
    name: "Checkmate",
    rows: ["2.2.2.2.2.2.2.", ".c.c.c?c.c.c.c", "2.2.2.2.2.2.2.", ".g.g.g.g?g.g.g", "2.2.2.2.2.2.2.", ".y?y.y.y.y.y.y", "3.3.3.3.3.3.3."],
  },
  {
    name: "Chain reaction",
    rows: ["oooooooooooooo", "o?oooooooooo?o", "ooooXooooXoooo", "ooooooXXoooooo", "ooooXooooXoooo", "o?oooooooooo?o", "oooooooooooooo"],
  },
  {
    name: "Fortress",
    rows: ["M.MMMM..MMMM.M", "M.2222..2222.M", "M.b?bb..bb?b.M", "M.cccc..cccc.M", "M.gggg..gggg.M", "M............M", "..yyyyyyyyyy.."],
  },
  {
    name: "Heart",
    rows: ["...pp....pp...", "..pppp..pppp..", ".pppppppppppp.", ".ppp?pXXp?ppp.", "..pppppppppp..", "...pppppppp...", "....pppppp....", ".....p22p.....", "......pp......"],
  },
  {
    name: "Invader",
    rows: ["...g......g...", "....g....g....", "...gggggggg...", "..gg2gggg2gg..", ".gggggggggggg.", ".g.gggXXggg.g.", ".g.g......g.g.", "....gg..gg....", "?............?"],
  },
  {
    name: "Diamond",
    rows: ["......cc......", ".....cbbc.....", "....cb22bc....", "...cb2332bc...", "..cb23?332bc..", "...cb2332bc...", "....cb22bc....", ".....cbbc.....", "......cc......"],
  },
  {
    name: "Steel bars",
    rows: ["rrrrrrrrrrrrrr", "MMMMM....MMMMM", "oo?ooooooooo?o", "yyyyyyyyyyyyyy", "....MMMMMM....", "gggggXggXggggg", "cccccccccccccc", "bb?bbbbbbbb?bb"],
  },
  {
    name: "The boss",
    rows: ["33333333333333", "3X?22222222?X3", "32bbbbbbbbbb23", "32b.MM..MM.b23", "32b.X????X.b23", "32b.MMMMMM.b23", "32bbbbbbbbbb23", "3X2222222222X3", "33333333333333"],
  },
];

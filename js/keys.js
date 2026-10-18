/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: "Bubble TT",
  cols: ["Teddy", "Tommy"],
  keys: [
    ["walk", "A D", "← →"],
    ["jump", "W", "↑"],
    ["blow a bubble (hold for more)", "F", "L"],
    ["call your brother · high five", "T or Enter", "T or Enter"],
    ["pause · sound", "P or Esc · M", ""],
  ],
  note: "1 player: either set of keys works, Space jumps and X blows too.",
  touch: "The pad on the left, ⬆️ and 🫧 on the right, and the big round button (bottom middle) for your brother.",
});

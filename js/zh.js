/* 中文 for Bubble TT: the words on the page, the toasts, the level and world names, the level tips, the ? panel, and
   the three words that pop up in the 3D scene (GRR!, TICKLE!, ZAP!, wrapped in Kit.lang.t in js/view.js).
   Stays in English on purpose: the kids' names (TEDDY, TOMMY, on the cards, name tags and toasts), the game's name
   and logo (Alan picks the names), and the letters of T-E-D-D-Y and T-O-M-M-Y (a spelling bonus). */
(function () {
  const L = Kit.lang;
  L.keep(['TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'Teddy：', 'Tommy：', 'Bubble TT', BT.TITLE, 'Esc']);

  // the 30 levels: names (cards' tooltips, the banner) and tips (the banner)
  const LEVELS = [
    ['Hello, Bubbles!', '泡泡你好！', 'Blow a bubble at a zombie, then pop it!', '对着僵尸吹个泡泡，再把泡泡戳破！'],
    ['Up, Up, Up!', '往上跳，往上跳！', 'Jump up through the platforms. No bumped heads!', '往上跳就能穿过平台，不会撞到头！'],
    ['Bubble Ladder', '泡泡梯子', 'Land on your own bubbles to bounce up high!', '踩在自己的泡泡上，能弹得高高的！'],
    ['Bouncy Blobs', '弹弹果冻怪', 'Blobs bounce! Catch them in the air.', '果冻怪会弹跳！在空中抓住它们。'],
    ['Holes in the Floor', '地板上的洞', 'Fall through a hole and you drop back in from the top!', '从洞里掉下去，会从上面掉回来！'],
    ['Backyard Party', '后院派对', 'Pop lots of bubbles at once for a COMBO!', '一次戳破好多泡泡，就是连击！'],
    ['Robot Friends?', '机器人朋友？', 'Robots are quick! Let them come to you.', '机器人跑得快！等它们自己过来。'],
    ['Block Tower', '积木塔', 'Climb the tower and catch everybody!', '爬上积木塔，把大家都抓住！'],
    ['Toy Stairs', '玩具楼梯', 'Hop up the stairs, one step at a time.', '一级一级跳上楼梯。'],
    ['Flying Robots', '飞行机器人', 'Flying robots zig-zag. Blow bubbles where they fly!', '飞行机器人飞来飞去，朝它们飞的地方吹泡泡！'],
    ['Toy Train', '玩具火车', 'Choo choo! Every car is a platform.', '呜呜！每节车厢都是平台。'],
    ['Toy Box', '玩具箱', 'Some baddies are hiding in the toy box!', '有坏蛋躲在玩具箱里！'],
    ['Lollipops', '棒棒糖', 'Sweet! Bigger combos make bigger treats.', '真甜！连击越大，零食越大。'],
    ['Candy Canes', '拐杖糖', 'Catch the water bubble and wash them all away!', '抓住水泡泡，把它们都冲走！'],
    ['Gumdrops', '软糖', 'Boing boing! So many blobs.', '嘣嘣嘣！好多果冻怪。'],
    ['Cupcake', '纸杯蛋糕', 'Climb the cupcake to the cherry on top!', '爬上纸杯蛋糕，摘到顶上的樱桃！'],
    ['Sugar Rush', '糖果狂欢', 'Everybody is zooming around. Stay calm and bubble!', '大家都在乱跑，别慌，吹泡泡！'],
    ['Candy Castle', '糖果城堡', 'Hop along the castle top!', '在城堡顶上跳来跳去！'],
    ['Moon Walk', '月球漫步', 'Holes in the floor! Drop down to pop up at the top.', '地板上有洞！掉下去就会从上面冒出来。'],
    ['Rocket', '火箭', 'Lightning bubbles zap everything in a row!', '闪电泡泡能把一整排都劈中！'],
    ['UFO', '飞碟', "Tommy's favourite: a flying saucer!", 'Tommy 最喜欢的：飞碟！'],
    ['Star Field', '满天星', 'Little platforms, big jumps!', '小小平台，大大跳跃！'],
    ['Planets', '行星', 'Round and round they go!', '转呀转呀转！'],
    ['Space Station', '太空站', 'Almost at the castle. You can do it!', '快到城堡啦，你能行！'],
    ['Castle Gate', '城堡大门', 'Welcome to the moon castle!', '欢迎来到月亮城堡！'],
    ['Towers', '高塔', 'Up the towers and down again!', '爬上高塔，再下来！'],
    ['Zigzag', '之字路', 'Zig, zag, zig, zag... bubble!', '左拐，右拐，左拐，右拐……吹泡泡！'],
    ['The Big Heart', '大大的爱心', 'Teddy and Tommy, best brothers ever!', 'Teddy 和 Tommy，最棒的兄弟！'],
    ['T and T', 'T 和 T', 'Two big Ts, for Teddy and Tommy!', '两个大大的 T，代表 Teddy 和 Tommy！'],
    ['Big Zom', '大僵尸', 'Big Zom has a bubble shield! Hit it with lots of bubbles and lightning.', '大僵尸有泡泡护盾！用好多泡泡和闪电打它。'],
  ];
  for (const [name, nameZh, tip, tipZh] of LEVELS) L.add({ [name]: nameZh, [tip]: tipZh });

  // the five worlds (level screen headings, the banner)
  const WORLDS = { BACKYARD: '后院', 'TOY ROOM': '玩具房', 'CANDY LAND': '糖果乐园', SPACE: '太空', 'MOON CASTLE': '月亮城堡', 'THE BIG ONE': '最终关' };
  L.add(WORLDS);

  L.add({
    // title screen
    'Teddy & Tommy blow bubbles!': 'Teddy 和 Tommy 吹泡泡！',
    'Teddy + Tommy together': 'Teddy + Tommy 一起玩',
    '🐣 EASY': '🐣 简单', '🔥 NORMAL': '🔥 普通', 'START AT LEVEL': '起始关卡',
    // level screen
    'PICK A LEVEL': '选一关', 'open every level': '打开所有关卡',
    // HUD
    LEVEL: '关卡', 'BIG ZOM': '大僵尸', 'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)',
    'press T': '按 T', 'tap for another treat': '再点一下，再来个零食', 'HIGH FIVE! ✋': '击掌！✋', 'HIGH FIVE': '击掌',
    // pause, game over, the end
    '↻ START LEVEL AGAIN': '↻ 重玩这一关', '🏠 MENU': '🏠 菜单',
    'OH NO!': '哎呀！', 'KEEP GOING!': '继续加油！', "Out of hearts. Everybody's just a bit dizzy.": '没有爱心啦。大家只是有点晕。',
    'YOU BEAT BIG ZOM!': '你打败了大僵尸！',
    // toasts
    '💧 SPLASH!': '💧 哗啦！', '⚡ ZAP!': '⚡ 劈啪！', 'HURRY UP! ⏰': '快一点！⏰',
    '👻 HERE COMES THE TICKLE GHOST!': '👻 挠痒痒小幽灵来啦！', 'CLEAR! 🎉': '过关啦！🎉', '✋ HIGH FIVE!': '✋ 击掌！',
    'BIG ZOM IS IN A BUBBLE! POP HIM!': '大僵尸被泡泡困住啦！快戳破它！', 'YOU DID IT! 🎂': '你成功啦！🎂',
    // the words that pop up in the 3D scene
    'GRR!': '哼！', 'TICKLE!': '咯吱咯吱！', 'ZAP!': '劈啪！',
    // the ? panel (js/keys.js)
    'blow a bubble (hold for more)': '吹泡泡（按住一直吹）',
    '1 player: either set of keys works, Space jumps and X blows too.': '单人：两套按键都能用，空格也能跳，X 也能吹泡泡。',
    'The pad on the left, ⬆️ and 🫧 on the right, and the big round button (bottom middle) for your brother.':
      '左边的方向键走路，右边的 ⬆️ 跳、🫧 吹泡泡，下面中间的大圆按钮叫兄弟来帮忙。',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  const who = (s) => s.replace(/^Teddy and Tommy$/, 'Teddy 和 Tommy');
  L.rule(/^LEVEL (\d+)$/, '第 $1 关');
  L.rule(/^LEVEL (\d+) · (.+)$/, (m, n, w) => `第 ${n} 关 · ${WORLDS[w] || w}`);
  L.rule(/^CALL (TEDDY|TOMMY)$/, '叫 $1 来帮忙');
  L.rule(/^(TEDDY|TOMMY) IS HERE!$/, '$1 来啦！');
  L.rule(/^ready in (\d+)$/, '还要 $1 秒');
  L.rule(/^HIGH FIVE IN (\d+)…$/, '还要 $1 秒才能击掌…');
  L.rule(/^BEST SCORE ([\d,]+)$/, '最高分 $1');
  L.rule(/^COMBO x(\d+)! (.*)$/, '连击 x$1！$2');
  L.rule(/^OOPS! (TEDDY|TOMMY) IS DIZZY (.*)$/, '哎呀！$1 晕啦 $2');
  L.rule(/^(TEDDY|TOMMY) SAVED YOU! (.*)$/, '$1 救了你！$2');
  L.rule(/^(TEDDY|TOMMY) BONUS! (.*)$/, '$1 奖励！$2');
  L.rule(/^(TEDDY|TOMMY) IS COMING TO HELP!$/, '$1 来帮忙啦！');
  L.rule(/^BYE BYE, (TEDDY|TOMMY)! (.*)$/, '拜拜，$1！$2');
  L.rule(/^(TEDDY|TOMMY) IS OUT OF HEARTS\. KEEP GOING, (TEDDY|TOMMY)!$/, '$1 没有爱心啦。$2，加油！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (TEDDY|TOMMY)!$/, (m, emoji, item, from) => `${emoji} ${from} 送来的${TREAT[item]}！`);
  L.rule(/^Out of hearts on level (\d+)\. Everybody's just a bit dizzy!$/, '第 $1 关没有爱心啦。大家只是有点晕！');
  L.rule(/^(.+) scored ([\d,]+) points and saved the moon castle!$/, (m, w, n) => `${who(w)} 得了 ${n} 分，救下了月亮城堡！`);
})();

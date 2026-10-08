// Built-in grammar deck (JLPT N5). Entries are introduced in this order.
// pattern: the grammar point; note_en/note_zh: a short explanation of use;
// ex: 1–2 example sentences (jp as written, kana = its full reading, en, zh).
export const GRAMMAR = [
  // ── Basic sentences with です ──
  { id: "wa-desu", pattern: "〜は〜です", en: "X is Y (polite)", zh: "X是Y（礼貌）",
    note_en: "は marks the topic (read “wa”); です makes the sentence polite.",
    note_zh: "は提示主题（读作“wa”）；です表示礼貌的判断。",
    ex: [
      { jp: "わたしは学生です。", kana: "わたしはがくせいです。", en: "I am a student.", zh: "我是学生。" },
      { jp: "リンさんは中国人です。", kana: "リンさんはちゅうごくじんです。", en: "Lin is Chinese.", zh: "林是中国人。" },
    ] },
  { id: "ja-arimasen", pattern: "〜じゃありません／〜ではありません", en: "X is not Y (polite)", zh: "X不是Y（礼貌）",
    note_en: "The negative of です after a noun. ではありません is more formal; じゃありません is common in speech. Do not use 〜くない here — that is only for い-adjectives.",
    note_zh: "名词句です的否定，相当于“不是”。ではありません较正式，じゃありません多用于口语。不要说“学生くない”，〜くない只用于い形容词。",
    ex: [
      { jp: "わたしは先生じゃありません。", kana: "わたしはせんせいじゃありません。", en: "I am not a teacher.", zh: "我不是老师。" },
      { jp: "これは水ではありません。", kana: "これはみずではありません。", en: "This is not water.", zh: "这不是水。" },
    ] },
  { id: "ka-question", pattern: "〜か", en: "question marker", zh: "疑问语气（……吗？）",
    note_en: "Add か to the end of a polite sentence to make a question; word order does not change. In formal writing a 。 is used instead of ？.",
    note_zh: "句末加か就成为疑问句，语序不变，和汉语的“吗”很像。正式书写时句末一般用“。”而不是“？”。",
    ex: [
      { jp: "リンさんは学生ですか。", kana: "リンさんはがくせいですか。", en: "Is Lin a student?", zh: "林是学生吗？" },
      { jp: "日本語はむずかしいですか。", kana: "にほんごはむずかしいですか。", en: "Is Japanese difficult?", zh: "日语难吗？" },
    ] },
  { id: "mo", pattern: "〜も", en: "also, too", zh: "也",
    note_en: "も replaces は, が or を (never say はも or をも). With other particles it is added after them: にも, でも.",
    note_zh: "相当于“也”，但放在名词后面而不是动词前面。も取代は・が・を（不说“はも”“をも”），其他助词则接在后面，如にも、でも。",
    ex: [
      { jp: "わたしも学生です。", kana: "わたしもがくせいです。", en: "I am a student too.", zh: "我也是学生。" },
      { jp: "あしたも雨です。", kana: "あしたもあめです。", en: "It will rain tomorrow too.", zh: "明天也下雨。" },
    ] },
  { id: "no", pattern: "〜の〜", en: "X's Y; Y of X", zh: "……的……",
    note_en: "の links two nouns: owner, belonging or type (日本語の本 = a Japanese-language book). Don't put の between an adjective and a noun (×高いの本).",
    note_zh: "连接两个名词，和“的”相似。但汉语可省略“的”的地方日语通常不能省（我妈妈 → わたしの母）；而形容词修饰名词时不加の（×高いの本）。",
    ex: [
      { jp: "これはわたしの本です。", kana: "これはわたしのほんです。", en: "This is my book.", zh: "这是我的书。" },
      { jp: "マイクさんは日本語の先生です。", kana: "マイクさんはにほんごのせんせいです。", en: "Mike is a Japanese-language teacher.", zh: "迈克是日语老师。" },
    ] },

  // ── Demonstratives and question words ──
  { id: "kore-sore-are", pattern: "これ／それ／あれ／どれ", en: "this one / that one / that one over there / which one", zh: "这个／那个（你那边）／那个（远处）／哪个",
    note_en: "これ is near the speaker, それ near the listener, あれ far from both; どれ asks “which one” among three or more. They stand alone and are never followed directly by a noun.",
    note_zh: "汉语只有“这/那”两分，日语是三分：これ靠近说话人，それ靠近听话人，あれ离双方都远；どれ用于三者以上的“哪个”。这些词单独使用，后面不能直接接名词。",
    ex: [
      { jp: "これは何ですか。", kana: "これはなんですか。", en: "What is this?", zh: "这是什么？" },
      { jp: "わたしのかさはどれですか。", kana: "わたしのかさはどれですか。", en: "Which one is my umbrella?", zh: "哪把是我的伞？" },
    ] },
  { id: "kono-sono-ano", pattern: "この〜／その〜／あの〜／どの〜", en: "this / that / that (over there) / which + noun", zh: "这个／那个／那个（远处）／哪个＋名词",
    note_en: "Same distance rules as これ/それ/あれ, but these must be followed by a noun: この本, not ×これ本.",
    note_zh: "远近关系与これ／それ／あれ相同，但后面必须接名词，如“この本”，不能说“×これ本”。",
    ex: [
      { jp: "この本は高いです。", kana: "このほんはたかいです。", en: "This book is expensive.", zh: "这本书很贵。" },
      { jp: "あの人はだれですか。", kana: "あのひとはだれですか。", en: "Who is that person?", zh: "那个人是谁？" },
    ] },
  { id: "koko-soko-asoko", pattern: "ここ／そこ／あそこ／どこ", en: "here / there / over there / where", zh: "这里／那里／那边（远处）／哪里",
    note_en: "Place words with the same near/middle/far system. Note it is あそこ, not ×あこ.",
    note_zh: "表示地点，远近关系同これ／それ／あれ。注意是“あそこ”，不是“×あこ”。",
    ex: [
      { jp: "トイレはあそこです。", kana: "トイレはあそこです。", en: "The restroom is over there.", zh: "洗手间在那边。" },
      { jp: "ここは学校です。", kana: "ここはがっこうです。", en: "This is a school.", zh: "这里是学校。" },
    ] },
  { id: "question-words", pattern: "何／だれ／どこ／いつ／いくら", en: "what / who / where / when / how much", zh: "什么／谁／哪里／什么时候／多少钱",
    note_en: "Put the question word where the answer would go and end with か. 何 is read なん before です, の and counters, and なに before most particles (何を). A question word as subject takes が, not は.",
    note_zh: "和汉语一样，疑问词放在答案所在的位置，不用改变语序，句末加か。何在です、の和量词前读“なん”，在を等助词前读“なに”。疑问词作主语时用が，不用は。",
    ex: [
      { jp: "これはいくらですか。", kana: "これはいくらですか。", en: "How much is this?", zh: "这个多少钱？" },
      { jp: "トイレはどこですか。", kana: "トイレはどこですか。", en: "Where is the restroom?", zh: "洗手间在哪里？" },
    ] },
  { id: "deshita", pattern: "〜でした／〜じゃありませんでした", en: "was / was not (polite, nouns and な-adjectives)", zh: "是……（过去）／不是……（过去）",
    note_en: "Past of です and its negative, used after nouns and な-adjectives. い-adjectives do not use でした: say 高かったです, not ×高いでした.",
    note_zh: "です的过去式及其否定，用于名词和な形容词。汉语没有时态变化，日语必须变。い形容词不能用でした：说“高かったです”，不说“×高いでした”。",
    ex: [
      { jp: "きのうは休みでした。", kana: "きのうはやすみでした。", en: "Yesterday was a day off.", zh: "昨天是休息日。" },
      { jp: "きのうは雨じゃありませんでした。", kana: "きのうはあめじゃありませんでした。", en: "It didn't rain yesterday.", zh: "昨天没下雨。" },
    ] },

  // ── Verbs: ます forms ──
  { id: "masu", pattern: "〜ます", en: "polite verb: do / will do", zh: "动词礼貌形：（经常）做／将要做",
    note_en: "The polite non-past form covers habits and the future; there is no separate future tense, so time words make it clear. The verb comes at the end of the sentence.",
    note_zh: "表示习惯或将来，日语没有单独的将来时，靠时间词区分。和汉语一样动词不随人称变化，但动词要放在句末。",
    ex: [
      { jp: "あした来ます。", kana: "あしたきます。", en: "I'll come tomorrow.", zh: "我明天来。" },
      { jp: "毎日コーヒーを飲みます。", kana: "まいにちコーヒーをのみます。", en: "I drink coffee every day.", zh: "我每天喝咖啡。" },
    ] },
  { id: "masen", pattern: "〜ません", en: "polite verb: don't / won't", zh: "动词礼貌否定：不（做）",
    note_en: "Negative of ます for habits and the future. It states what you don't or won't do.",
    note_zh: "ます的否定，相当于“不……”，表示习惯上不做或将来不做。注意：“没做（过去）”要用ませんでした，不是ません。",
    ex: [
      { jp: "わたしはおさけを飲みません。", kana: "わたしはおさけをのみません。", en: "I don't drink alcohol.", zh: "我不喝酒。" },
      { jp: "日曜日は学校へ行きません。", kana: "にちようびはがっこうへいきません。", en: "I don't go to school on Sundays.", zh: "星期天不去学校。" },
    ] },
  { id: "mashita", pattern: "〜ました／〜ませんでした", en: "polite past: did / didn't", zh: "动词礼貌过去式：做了／没做",
    note_en: "Past and past negative of ます. For “not yet” use まだ〜ていません, not ませんでした.",
    note_zh: "ました≈“……了”，ませんでした≈“没……”。但汉语“还没吃”要说“まだ食べていません”，不要用ませんでした。",
    ex: [
      { jp: "きのう、えいがを見ました。", kana: "きのう、えいがをみました。", en: "I watched a movie yesterday.", zh: "昨天看了电影。" },
      { jp: "けさ、何も食べませんでした。", kana: "けさ、なにもたべませんでした。", en: "I didn't eat anything this morning.", zh: "今天早上什么也没吃。" },
    ] },

  // ── Particles with verbs ──
  { id: "wo", pattern: "〜を", en: "direct object marker", zh: "宾语助词",
    note_en: "Marks what the action is done to. Written を but read “o”. The object comes before the verb.",
    note_zh: "标记动作的对象，写作を读作“o”。汉语是“喝水”，日语是“水を飲む”，宾语在动词前面。",
    ex: [
      { jp: "パンを食べます。", kana: "パンをたべます。", en: "I eat bread.", zh: "我吃面包。" },
      { jp: "毎日、新聞を読みます。", kana: "まいにち、しんぶんをよみます。", en: "I read the newspaper every day.", zh: "我每天看报纸。" },
    ] },
  { id: "ni-time", pattern: "〜に (time)", en: "at / on (a specific time)", zh: "在（具体时间）",
    note_en: "Use に after clock times and dates (七時に, 五月一日に); with days of the week it is common but optional (日曜日（に）). Do not use it with relative words like 今日, あした or 毎日.",
    note_zh: "汉语时间词不加助词，日语具体时间（七時、日期）后要加に，星期后一般也加（日曜日（に），可省略）；但今日、あした、毎日等相对时间不加に。",
    ex: [
      { jp: "七時におきます。", kana: "しちじにおきます。", en: "I get up at seven.", zh: "我七点起床。" },
      { jp: "土曜日にテニスをします。", kana: "どようびにテニスをします。", en: "I play tennis on Saturday.", zh: "星期六打网球。" },
    ] },
  { id: "ni-destination", pattern: "〜に行きます／来ます／かえります", en: "to (destination)", zh: "去／来／回（某地）",
    note_en: "With verbs of movement, に marks the destination. It is close in meaning to へ.",
    note_zh: "与移动动词连用，に表示目的地。汉语“去北京”地点在动词后，日语是“北京に行きます”，地点在前。",
    ex: [
      { jp: "あした、ぎんこうに行きます。", kana: "あした、ぎんこうにいきます。", en: "I'll go to the bank tomorrow.", zh: "明天去银行。" },
      { jp: "来年、日本に行きます。", kana: "らいねん、にほんにいきます。", en: "I'm going to Japan next year.", zh: "明年去日本。" },
    ] },
  { id: "e-direction", pattern: "〜へ", en: "toward, to (direction)", zh: "往……，去……（方向）",
    note_en: "Marks direction with movement verbs. Written へ but read “e”. Usually interchangeable with destination に.",
    note_zh: "表示移动的方向，写作へ读作“e”。和表示目的地的に大多可以互换。",
    ex: [
      { jp: "学校へ行きます。", kana: "がっこうへいきます。", en: "I go to school.", zh: "我去学校。" },
      { jp: "日曜日はどこへ行きますか。", kana: "にちようびはどこへいきますか。", en: "Where are you going on Sunday?", zh: "星期天去哪儿？" },
    ] },
  { id: "de-place", pattern: "〜で (place of action)", en: "at / in (where an action happens)", zh: "在（某处做某事）",
    note_en: "Marks the place where an action happens. A common mistake is using に here; に is for where something exists, で is for where something is done.",
    note_zh: "相当于“在＋地点＋动作”的“在”。常见错误是用に：表示存在（在哪儿有）用に，表示动作发生的场所用で。",
    ex: [
      { jp: "駅で友だちをまちます。", kana: "えきでともだちをまちます。", en: "I'll wait for my friend at the station.", zh: "在车站等朋友。" },
      { jp: "うちでばんごはんを食べます。", kana: "うちでばんごはんをたべます。", en: "I eat dinner at home.", zh: "在家吃晚饭。" },
    ] },
  { id: "de-means", pattern: "〜で (means)", en: "by / with / in (means, tool, language)", zh: "用／坐（手段、工具、语言）",
    note_en: "Marks the tool, transport or language used: 電車で (by train), はしで (with chopsticks), 日本語で (in Japanese).",
    note_zh: "表示手段、工具、交通方式或语言，相当于“用……”“坐……”。注意“走着去”说“あるいて行きます”，不是“×足で”。",
    ex: [
      { jp: "電車で会社へ行きます。", kana: "でんしゃでかいしゃへいきます。", en: "I go to work by train.", zh: "我坐电车去公司。" },
      { jp: "はしでごはんを食べます。", kana: "はしでごはんをたべます。", en: "I eat with chopsticks.", zh: "用筷子吃饭。" },
    ] },
  { id: "to", pattern: "〜と", en: "and (complete list); with (someone)", zh: "和（列举全部）；跟（某人一起）",
    note_en: "と joins nouns into a complete list, or marks the person you do something with. It cannot join verbs, adjectives or sentences.",
    note_zh: "和汉语的“和/跟”相似，可列举名词或表示“跟某人一起”。但只能连接名词，不能连接动词、形容词或句子。",
    ex: [
      { jp: "パンとたまごを食べます。", kana: "パンとたまごをたべます。", en: "I eat bread and eggs.", zh: "吃面包和鸡蛋。" },
      { jp: "友だちとえいがを見ました。", kana: "ともだちとえいがをみました。", en: "I watched a movie with a friend.", zh: "和朋友看了电影。" },
    ] },
  { id: "kara-made", pattern: "〜から〜まで", en: "from X to Y (time or place)", zh: "从……到……",
    note_en: "から marks the starting point and まで the end point, for both time and place. Each can also be used alone.",
    note_zh: "与汉语“从……到……”几乎一样，可用于时间和地点，但助词放在名词后面。也可单独使用。",
    ex: [
      { jp: "ぎんこうは九時から三時までです。", kana: "ぎんこうはくじからさんじまでです。", en: "The bank is open from nine to three.", zh: "银行从九点到三点营业。" },
      { jp: "うちから駅まであるきます。", kana: "うちからえきまであるきます。", en: "I walk from home to the station.", zh: "从家走到车站。" },
    ] },

  // ── が and existence ──
  { id: "ga-subject", pattern: "〜が", en: "subject marker (new information)", zh: "主语助词（强调新信息）",
    note_en: "が marks the subject when it is new or is the point of the sentence, and always after question words (だれが, 何が). は sets the topic; が picks out who or what.",
    note_zh: "が标记主语，强调“是谁/是什么”；疑问词作主语时必须用が（だれが），回答也用が。は是话题，が是焦点。",
    ex: [
      { jp: "だれが来ましたか。", kana: "だれがきましたか。", en: "Who came?", zh: "谁来了？" },
      { jp: "リンさんが来ました。", kana: "リンさんがきました。", en: "Lin came.", zh: "林来了。" },
    ] },
  { id: "aru-iru", pattern: "〜があります／〜がいます", en: "there is / to have", zh: "有／在",
    note_en: "あります is for things and plants; います is for people and animals. あります also means “to have” an event or time: テストがあります.",
    note_zh: "汉语一个“有”就够了，日语要区分：物品、植物用あります，人和动物用います。あります还可表示“有（活动、时间）”。",
    ex: [
      { jp: "あしたテストがあります。", kana: "あしたテストがあります。", en: "I have a test tomorrow.", zh: "明天有考试。" },
      { jp: "あ、ねこがいます。", kana: "あ、ねこがいます。", en: "Oh, there's a cat.", zh: "啊，有只猫。" },
    ] },
  { id: "ni-location", pattern: "〜に〜があります／います", en: "X is at / in (place of existence)", zh: "在（某处）有……",
    note_en: "に marks where something or someone is. Use に, not で, with あります/います. Two orders: Place に Thing が あります, or Thing は Place に あります.",
    note_zh: "に表示存在的场所，相当于“在”。与あります／います连用时用に，不用で。语序：“地点に 物が あります”（某处有某物）或“物は 地点に あります”（某物在某处）。",
    ex: [
      { jp: "つくえの上に本があります。", kana: "つくえのうえにほんがあります。", en: "There is a book on the desk.", zh: "桌子上有本书。" },
      { jp: "母は今、うちにいます。", kana: "はははいま、うちにいます。", en: "My mother is at home now.", zh: "我妈妈现在在家。" },
    ] },
  { id: "ya", pattern: "〜や〜（など）", en: "X, Y, and so on (partial list)", zh: "……和……等等（部分列举）",
    note_en: "や lists a few examples and suggests there are more; など (“etc.”) is often added. Use と for a complete list.",
    note_zh: "部分列举，相当于“……啦……啦、……等”，常与など连用。全部列举时用と。",
    ex: [
      { jp: "かばんの中に本やノートがあります。", kana: "かばんのなかにほんやノートがあります。", en: "There are books, notebooks and so on in the bag.", zh: "包里有书、本子什么的。" },
      { jp: "りんごやバナナなどを買いました。", kana: "りんごやバナナなどをかいました。", en: "I bought apples, bananas and other things.", zh: "买了苹果、香蕉等。" },
    ] },

  // ── Adjectives ──
  { id: "i-adj", pattern: "〜いです／〜くないです", en: "い-adjective: is / is not", zh: "い形容词：肯定／否定",
    note_en: "い-adjectives go straight before nouns (高い本). For the negative, change い to くないです (or くありません). Irregular: いい → よくないです.",
    note_zh: "い形容词可直接修饰名词（高い本），不加の。否定把い变成くないです（或くありません），不能说“×高いじゃありません”。特殊：いい → よくないです。",
    ex: [
      { jp: "日本語はおもしろいです。", kana: "にほんごはおもしろいです。", en: "Japanese is interesting.", zh: "日语很有意思。" },
      { jp: "今日は天気がよくないです。", kana: "きょうはてんきがよくないです。", en: "The weather isn't good today.", zh: "今天天气不好。" },
    ] },
  { id: "i-adj-past", pattern: "〜かったです／〜くなかったです", en: "い-adjective: was / was not", zh: "い形容词过去式：……了／不……（过去）",
    note_en: "Change い to かったです for the past and くなかったです for the past negative. Common mistake: ×さむいでした. いい becomes よかったです.",
    note_zh: "过去式把い变成かったです，过去否定变成くなかったです。常见错误：“×さむいでした”。いい → よかったです。",
    ex: [
      { jp: "きのうはさむかったです。", kana: "きのうはさむかったです。", en: "It was cold yesterday.", zh: "昨天很冷。" },
      { jp: "テストはむずかしくなかったです。", kana: "テストはむずかしくなかったです。", en: "The test wasn't difficult.", zh: "考试不难。" },
    ] },
  { id: "na-adj", pattern: "〜な＋noun／〜じゃないです", en: "な-adjective: before a noun / negative", zh: "な形容词：修饰名词／否定",
    note_en: "Add な before a noun (しずかなこうえん). Otherwise they work like nouns: しずかです, しずかじゃないです, しずかでした. きれい and ゆうめい end in い but are な-adjectives.",
    note_zh: "修饰名词时加な（しずかなこうえん），其余变化与名词相同：しずかです／しずかじゃないです／しずかでした。注意きれい、ゆうめい虽以い结尾，却是な形容词。",
    ex: [
      { jp: "ここはしずかなこうえんです。", kana: "ここはしずかなこうえんです。", en: "This is a quiet park.", zh: "这是个安静的公园。" },
      { jp: "このへやはきれいじゃないです。", kana: "このへやはきれいじゃないです。", en: "This room isn't clean.", zh: "这个房间不干净。" },
    ] },
  { id: "suki-jouzu", pattern: "〜がすきです／〜がじょうずです", en: "like X / be good at X", zh: "喜欢……／擅长……",
    note_en: "The thing you like or are good at is marked with が, not を. じょうず is praise for others; for yourself use とくい.",
    note_zh: "汉语“喜欢”直接带宾语，所以容易说成“×をすき”，正确是“〜がすきです”。じょうず用于称赞别人，说自己擅长时用とくい。",
    ex: [
      { jp: "わたしはねこがすきです。", kana: "わたしはねこがすきです。", en: "I like cats.", zh: "我喜欢猫。" },
      { jp: "リンさんは日本語がじょうずですね。", kana: "リンさんはにほんごがじょうずですね。", en: "Your Japanese is good, Lin.", zh: "林日语说得真好啊。" },
    ] },
  { id: "yori-hou", pattern: "〜より〜のほうが〜", en: "Y is more ... than X", zh: "比起……，……更……",
    note_en: "Xより Yのほうが adjective = Y is more ... than X. The adjective itself does not change (no “more” form). To ask, use XとYとどちらが〜ですか.",
    note_zh: "“AよりBのほうが＋形容词”＝“B比A更……”。注意顺序和汉语“B比A”相反：より前面的A是比较的基准（相当于汉语“比”后面的词）。形容词本身不变。问法：AとBとどちらが〜ですか。",
    ex: [
      { jp: "電車よりバスのほうが安いです。", kana: "でんしゃよりバスのほうがやすいです。", en: "The bus is cheaper than the train.", zh: "公交车比电车便宜。" },
      { jp: "わたしはなつよりふゆのほうがすきです。", kana: "わたしはなつよりふゆのほうがすきです。", en: "I like winter more than summer.", zh: "比起夏天，我更喜欢冬天。" },
    ] },

  // ── Wanting, invitations ──
  { id: "tai", pattern: "〜たいです", en: "want to do", zh: "想（做）",
    note_en: "ます-stem + たいです (行きます → 行きたいです). It changes like an い-adjective: たくないです, たかったです. The object can take を or が; both are used and correct (水を飲みたいです / 水が飲みたいです). Use it for your own wishes or to ask the listener’s, not for a third person; asking a superior 〜たいですか directly can sound rude.",
    note_zh: "ます形去掉ます加たいです，相当于“想……”，按い形容词变化（たくないです、たかったです）。宾语用を或が都可以，两种都常用（水を飲みたいです／水が飲みたいです）。用于说自己的愿望或询问对方，不直接用于第三人称；直接问长辈“〜たいですか”不礼貌。",
    ex: [
      { jp: "日本へ行きたいです。", kana: "にほんへいきたいです。", en: "I want to go to Japan.", zh: "我想去日本。" },
      { jp: "つめたい水が飲みたいです。", kana: "つめたいみずがのみたいです。", en: "I want to drink cold water.", zh: "我想喝凉水。" },
    ] },
  { id: "mashou", pattern: "〜ましょう／〜ましょうか", en: "let's ...; shall I/we ...?", zh: "……吧；要不要我……？",
    note_en: "ましょう suggests doing something together. ましょうか offers help (“shall I?”) or asks “shall we?”.",
    note_zh: "ましょう相当于“我们……吧”；ましょうか表示主动提议“要不要我来……？”或“我们……好吗？”。",
    ex: [
      { jp: "いっしょにかえりましょう。", kana: "いっしょにかえりましょう。", en: "Let's go home together.", zh: "一起回去吧。" },
      { jp: "まどをあけましょうか。", kana: "まどをあけましょうか。", en: "Shall I open the window?", zh: "要我开窗吗？" },
    ] },
  { id: "masenka", pattern: "〜ませんか", en: "won't you ...? (invitation)", zh: "要不要一起……？（邀请）",
    note_en: "A polite invitation. It looks negative but means “would you like to?”. It is softer than ましょう. Accept with ええ、いいですね.",
    note_zh: "形式是否定，意思却是邀请，类似“要不要……？”“一起……好吗？”，比ましょう更客气。接受时说“ええ、いいですね”。",
    ex: [
      { jp: "いっしょにえいがを見ませんか。", kana: "いっしょにえいがをみませんか。", en: "Would you like to see a movie together?", zh: "要不要一起看电影？" },
      { jp: "日曜日、テニスをしませんか。", kana: "にちようび、テニスをしませんか。", en: "How about playing tennis on Sunday?", zh: "星期天一起打网球好吗？" },
    ] },

  // ── Te-form ──
  { id: "te-form", pattern: "〜て／〜で", en: "te-form: and then (linking actions)", zh: "て形：……然后……（连接动作）",
    note_en: "う-verbs (group 1): う/つ/る → って, む/ぶ/ぬ → んで, く → いて, ぐ → いで, す → して. る-verbs (group 2, e.g. 食べる) drop る and add て. Irregular: する → して, くる → きて, 行く → 行って. The last verb sets the tense.",
    note_zh: "五段动词：う・つ・る→って，む・ぶ・ぬ→んで，く→いて，ぐ→いで，す→して；一段动词去る加て；する→して，くる→きて，行く→行って（例外）。时态由句末动词决定。",
    ex: [
      { jp: "あさごはんを食べて、学校へ行きます。", kana: "あさごはんをたべて、がっこうへいきます。", en: "I eat breakfast and then go to school.", zh: "吃了早饭然后去学校。" },
      { jp: "うちへかえって、ねました。", kana: "うちへかえって、ねました。", en: "I went home and went to bed.", zh: "回家后就睡了。" },
    ] },
  { id: "te-kudasai", pattern: "〜てください", en: "please do ...", zh: "请……",
    note_en: "A polite request: te-form + ください, like “please …”. It is still a direction, so to sound softer start with すみませんが、…. To ask someone not to do something, use 〜ないでください.",
    note_zh: "て形＋ください，相当于“请……”。但它仍是一种指示，想更委婉时可在前面加“すみませんが、…”。“请不要……”是〜ないでください。",
    ex: [
      { jp: "ちょっとまってください。", kana: "ちょっとまってください。", en: "Please wait a moment.", zh: "请稍等。" },
      { jp: "ここに名前を書いてください。", kana: "ここになまえをかいてください。", en: "Please write your name here.", zh: "请在这里写名字。" },
    ] },
  { id: "te-imasu", pattern: "〜ています", en: "is doing (ongoing action)", zh: "正在……",
    note_en: "Te-form + います shows an action in progress. It also shows habits and lasting states: すんでいます (live), けっこんしています (be married).",
    note_zh: "相当于“正在……（呢）”。也表示习惯和状态的持续：表示“已婚（现在的状态）”说“けっこんしています”；けっこんしました只表示“结婚”这一事件。",
    ex: [
      { jp: "今、雨がふっています。", kana: "いま、あめがふっています。", en: "It's raining now.", zh: "现在正在下雨。" },
      { jp: "リンさんは今、電話で話しています。", kana: "リンさんはいま、でんわではなしています。", en: "Lin is talking on the phone now.", zh: "林现在正在打电话。" },
    ] },
  { id: "te-mo-ii", pattern: "〜てもいいです", en: "may do; it's OK to do", zh: "可以……",
    note_en: "Te-form + もいいです gives permission; add か to ask for it. Answer ええ、いいですよ, or refuse softly with すみません、ちょっと…",
    note_zh: "表示许可，相当于“可以……”；问“可以……吗？”用〜てもいいですか。委婉拒绝说“すみません、ちょっと…”。",
    ex: [
      { jp: "ここでしゃしんをとってもいいですか。", kana: "ここでしゃしんをとってもいいですか。", en: "May I take photos here?", zh: "可以在这里拍照吗？" },
      { jp: "この本を読んでもいいですよ。", kana: "このほんをよんでもいいですよ。", en: "You can read this book.", zh: "这本书你可以看哦。" },
    ] },
  { id: "te-wa-ikemasen", pattern: "〜てはいけません", en: "must not do", zh: "不可以……；禁止……",
    note_en: "Te-form + はいけません forbids something; は is read “wa”. It is strong and used for rules. For a polite personal request, use 〜ないでください.",
    note_zh: "表示禁止，相当于“不可以／不准……”，は读作“wa”。语气较强，多用于规则；个人请求用〜ないでください更客气。",
    ex: [
      { jp: "ここでたばこをすってはいけません。", kana: "ここでたばこをすってはいけません。", en: "You must not smoke here.", zh: "这里不准吸烟。" },
      { jp: "テストのとき、話してはいけません。", kana: "テストのとき、はなしてはいけません。", en: "You must not talk during the test.", zh: "考试时不可以说话。" },
    ] },
  { id: "te-kara", pattern: "〜てから", en: "after doing ...", zh: "……之后（再）……",
    note_en: "Te-form + から: do A first, then B. It stresses the order more than a plain te-form. Don't confuse it with から “because”, which follows a plain or polite form.",
    note_zh: "て形＋から，相当于“先……然后再……”，比单纯的て形更强调先后顺序。不要和表示原因的から混淆。",
    ex: [
      { jp: "手をあらってから、ごはんを食べます。", kana: "てをあらってから、ごはんをたべます。", en: "I wash my hands, and then I eat.", zh: "洗了手再吃饭。" },
      { jp: "しゅくだいをしてから、テレビを見ました。", kana: "しゅくだいをしてから、テレビをみました。", en: "After doing my homework, I watched TV.", zh: "做完作业后看了电视。" },
    ] },

  // ── Clauses ──
  { id: "mae-ni", pattern: "〜まえに", en: "before ...", zh: "……之前",
    note_en: "Dictionary form + まえに, or noun + のまえに. The verb stays in dictionary form even when the sentence is past (×食べたまえに).",
    note_zh: "动词原形＋まえに，名词＋のまえに，和汉语“……以前”语序相同。即使句子是过去时，まえに前面的动词也用原形（×食べたまえに）。",
    ex: [
      { jp: "ねるまえに、はをみがきます。", kana: "ねるまえに、はをみがきます。", en: "I brush my teeth before going to bed.", zh: "睡觉前刷牙。" },
      { jp: "ごはんのまえに、手をあらってください。", kana: "ごはんのまえに、てをあらってください。", en: "Please wash your hands before the meal.", zh: "饭前请洗手。" },
    ] },
  { id: "toki", pattern: "〜とき", en: "when ...", zh: "……的时候",
    note_en: "Noun + のとき, な-adjective + なとき, い-adjective or plain verb + とき. Don't add の after verbs or い-adjectives (×さむいのとき).",
    note_zh: "与“……的时候”非常相似，但只有名词后加の（子どものとき）；な形容词加な（ひまなとき）；动词、い形容词直接接とき，不加の（×さむいのとき）。",
    ex: [
      { jp: "子どものとき、よく川であそびました。", kana: "こどものとき、よくかわであそびました。", en: "When I was a child, I often played in the river.", zh: "小时候常在河里玩。" },
      { jp: "ひまなとき、本を読みます。", kana: "ひまなとき、ほんをよみます。", en: "I read books when I'm free.", zh: "有空的时候看书。" },
    ] },
  { id: "kara-because", pattern: "〜から (because)", en: "because, so", zh: "因为……（所以）",
    note_en: "Reason + から, then the result. After nouns and な-adjectives use ですから (or だから). Answer どうしてですか with 〜からです.",
    note_zh: "相当于“因为……所以……”，但から紧跟在原因后面，再说结果，不需要另加“所以”。名词、な形容词后用ですから。",
    ex: [
      { jp: "今日は雨ですから、うちにいます。", kana: "きょうはあめですから、うちにいます。", en: "It's raining today, so I'll stay home.", zh: "今天下雨，所以待在家里。" },
      { jp: "高いですから、買いません。", kana: "たかいですから、かいません。", en: "It's expensive, so I won't buy it.", zh: "因为贵，所以不买。" },
    ] },
  { id: "ga-but", pattern: "〜が (but)", en: "but, although", zh: "但是，可是",
    note_en: "Joins two clauses that contrast; が goes at the end of the first clause. It also softens an opening: すみませんが、… Don't confuse it with the subject marker が.",
    note_zh: "相当于“……，但是……”，但が放在前一分句的末尾。也用于委婉开头，如“すみませんが、…”。注意与主语助词が区分。",
    ex: [
      { jp: "このりょうりはおいしいですが、高いです。", kana: "このりょうりはおいしいですが、たかいです。", en: "This dish is tasty, but it's expensive.", zh: "这道菜好吃，但是很贵。" },
      { jp: "すみませんが、駅はどこですか。", kana: "すみませんが、えきはどこですか。", en: "Excuse me, where is the station?", zh: "不好意思，请问车站在哪儿？" },
    ] },

  // ── Sentence endings ──
  { id: "ne-yo", pattern: "〜ね／〜よ", en: "isn't it? (ね) / I tell you (よ)", zh: "……吧／……呢（ね）；……哦（よ）",
    note_en: "ね asks for or shows agreement about something both people know. よ gives the listener new information. Using よ too much, especially to superiors, can sound pushy.",
    note_zh: "ね用于寻求或表示共鸣，像“……呢／……吧”；よ用于告诉对方不知道的信息，像“……哦”。对长辈多用よ会显得强势。",
    ex: [
      { jp: "今日はいい天気ですね。", kana: "きょうはいいてんきですね。", en: "Nice weather today, isn't it?", zh: "今天天气真好啊。" },
      { jp: "あのレストランはおいしいですよ。", kana: "あのレストランはおいしいですよ。", en: "That restaurant is good, you know.", zh: "那家餐厅很好吃哦。" },
    ] },
];

import {
  COMPANION_MATERIAL_SCHEMA_VERSION,
  type CompanionMaterialRecord,
} from './types.ts';

/**
 * Generated from a private, raw-free 909-source review artifact.
 *
 * This public runtime file contains only non-verbatim direct lines and
 * rewrite guidance. It intentionally contains no source dialogue, title, URL,
 * local path, source disposition or private evidence pointer.
 */
const REVIEWED_AT = Date.UTC(2026, 7, 1);
const RUNTIME_PACK_ID = 'lysk-idle-opener-runtime-v1';

export interface BuiltInIdleDirectLine {
  id: string;
  charId: string;
  text: string;
  openerClass: string;
  semanticCluster: string;
  cooldownMs: number;
  maxDeliveries: 1;
}

const DIRECT_SPECS = [
  {
    "id": "lysk-idle-2dece60803e4f6770ae0",
    "charId": "builtin-zayne",
    "openerClass": "playful_prompt",
    "semanticCluster": "看牙体验的轻问",
    "cooldownMs": 10368000000,
    "text": "牙医总会问些奇怪的问题。你最不想听到哪一句？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-6d2aa1eedd8266fc2ee7",
    "charId": "builtin-zayne",
    "openerClass": "light_question",
    "semanticCluster": "图案细节的安静提问",
    "cooldownMs": 7776000000,
    "text": "有些图案看久了，反而会觉得舒服。你会先注意颜色还是纹理？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-a226dad09c4e0ed69cdd",
    "charId": "builtin-zayne",
    "openerClass": "light_question",
    "semanticCluster": "低压力的观看话题",
    "cooldownMs": 7776000000,
    "text": "现在最想看点什么？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-fafed3502aa813f46778",
    "charId": "builtin-zayne",
    "openerClass": "small_choice",
    "semanticCluster": "运动方式的小选择",
    "cooldownMs": 7776000000,
    "text": "忽然想起个问题：对抗和独自练习，你更偏向哪一种？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-22bfdeb9061842e0f22d",
    "charId": "builtin-sylus",
    "openerClass": "playful_prompt",
    "semanticCluster": "镜头取景的轻问",
    "cooldownMs": 7776000000,
    "text": "如果只留一张照片，你会想把镜头对准什么？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-3d31dff0a68766d78f93",
    "charId": "builtin-sylus",
    "openerClass": "light_question",
    "semanticCluster": "创作成果的轻问",
    "cooldownMs": 7776000000,
    "text": "最近有没有画到让你自己满意的东西？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-a93b2075eb1a0f4dc222",
    "charId": "builtin-sylus",
    "openerClass": "low_pressure_share",
    "semanticCluster": "直白的新鲜事入口",
    "cooldownMs": 7776000000,
    "text": "有什么新鲜事，想说就说。",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-25df095aff3d9a57b27a",
    "charId": "builtin-daily-companion",
    "openerClass": "light_question",
    "semanticCluster": "旧物性格的玩笑",
    "cooldownMs": 7776000000,
    "text": "旧东西陪久了，会不会也有自己的脾气？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-4458ca88806451052e76",
    "charId": "builtin-daily-companion",
    "openerClass": "playful_prompt",
    "semanticCluster": "小海龟的想象闲聊",
    "cooldownMs": 10368000000,
    "text": "小海龟慢吞吞的时候，像不像在认真想事情？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-6d73e85959022f23a448",
    "charId": "builtin-daily-companion",
    "openerClass": "small_choice",
    "semanticCluster": "月色与故事的选择",
    "cooldownMs": 7776000000,
    "text": "满月和故事，总有一个更容易让人走神。你选哪个？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-cc8fd6ea47add87ed0c5",
    "charId": "builtin-daily-companion",
    "openerClass": "small_choice",
    "semanticCluster": "饮料选择的闲聊",
    "cooldownMs": 7776000000,
    "text": "要是只选一种饮料慢慢喝，你会选什么？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-17ca00130b8050bf537b",
    "charId": "builtin-xavier",
    "openerClass": "light_question",
    "semanticCluster": "远景注意力的轻问",
    "cooldownMs": 7776000000,
    "text": "夜里往远处看时，你最先会注意到什么？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-4ce0cf3705da086ddee1",
    "charId": "builtin-xavier",
    "openerClass": "light_question",
    "semanticCluster": "小习惯的轻问",
    "cooldownMs": 7776000000,
    "text": "你觉得一个人的小习惯，是藏不住还是不必藏？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-7b1beaf2bbbc3db66772",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "直觉与细节的小选择",
    "cooldownMs": 10368000000,
    "text": "有件小事想确认一下：你做决定时，会先相信直觉还是细节？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-d8f59fbb9bb1d438c0e3",
    "charId": "builtin-xavier",
    "openerClass": "playful_prompt",
    "semanticCluster": "游戏名字的玩笑",
    "cooldownMs": 7776000000,
    "text": "游戏里遇到奇怪的名字时，你会认真记住，还是当成彩蛋？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-457e3994062f690ecda9",
    "charId": "builtin-caleb",
    "openerClass": "playful_prompt",
    "semanticCluster": "花束联想的玩笑",
    "cooldownMs": 7776000000,
    "text": "一大束花摆在眼前，你会先数颜色，还是先猜它想说什么？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-605ff034df8947361f79",
    "charId": "builtin-caleb",
    "openerClass": "light_question",
    "semanticCluster": "故事转折的闲问",
    "cooldownMs": 7776000000,
    "text": "追到一半的故事，最怕哪种转折？",
    "maxDeliveries": 1
  },
  {
    "id": "lysk-idle-94d405206554b70d409a",
    "charId": "builtin-caleb",
    "openerClass": "playful_prompt",
    "semanticCluster": "短选择题的玩笑",
    "cooldownMs": 7776000000,
    "text": "要不要玩个很短的选择题？不用认真。",
    "maxDeliveries": 1
  }
] as const satisfies readonly BuiltInIdleDirectLine[];

const REWRITE_SPECS = [
  {
    "id": "lysk-idle-0647e2c36e7b1ea083d8",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "工作收尾后的放松",
    "cooldownMs": 10368000000,
    "guidance": "以工作收尾后的放松方式为话题，给出简短、克制的日常关照。"
  },
  {
    "id": "lysk-idle-0eaa7b2e08f0a1511f53",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "外卖偏好的实际观察",
    "cooldownMs": 10368000000,
    "guidance": "围绕外卖里最容易踩雷或最想复购的一样东西，带着实际观察交换看法。"
  },
  {
    "id": "lysk-idle-1dfe4cfe37b34a040f00",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "火车",
    "cooldownMs": 10368000000,
    "guidance": "讨论火车上的小物件，顺便提一下行李整理。"
  },
  {
    "id": "lysk-idle-28284705e1a1275fb320",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "敬老院",
    "cooldownMs": 10368000000,
    "guidance": "分享敬老院演出，顺便提一提表演天赋。"
  },
  {
    "id": "lysk-idle-2d3e8a95d5c77d705261",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "夜间放松的小选择",
    "cooldownMs": 10368000000,
    "guidance": "以夜间独处时的放松选择为话题，用短句和轻缓节奏展开。"
  },
  {
    "id": "lysk-idle-2dd84f0896f390e5eedc",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "具体互动：询问Evol反噬情况和感受，分享个人经历。",
    "cooldownMs": 10368000000,
    "guidance": "询问Evol反噬情况和感受，分享个人经历。"
  },
  {
    "id": "lysk-idle-2e9d3fce59427782b7ed",
    "charId": "builtin-zayne",
    "openerClass": "small_choice",
    "semanticCluster": "聚会冷场的机灵化解",
    "cooldownMs": 10368000000,
    "guidance": "围绕聚会里突然安静下来的片刻，用趣事和岔开话题的机灵化开气氛。"
  },
  {
    "id": "lysk-idle-38af869a72182ce02dc5",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "植物养护",
    "cooldownMs": 10368000000,
    "guidance": "聊聊小桔和金桔的养护情况，顺便提一下种植箱的事情。"
  },
  {
    "id": "lysk-idle-39d0e00adcab4bdcb056",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "情绪起伏的平静确认",
    "cooldownMs": 10368000000,
    "guidance": "从一件容易让人起情绪的小事切入，用平静确认和轻微反问留下讨论空间。"
  },
  {
    "id": "lysk-idle-3be05f5256081729bc1e",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "绣球花的光线观察",
    "cooldownMs": 10368000000,
    "guidance": "围绕绣球花在不同光线下的颜色变化，延展成安静的观察话题。"
  },
  {
    "id": "lysk-idle-3f648371f212c472e2df",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "花束",
    "cooldownMs": 10368000000,
    "guidance": "聊聊花束感受，顺便提一下回礼方案。"
  },
  {
    "id": "lysk-idle-40516f50ea0e94474c29",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "具体互动：讨论娃娃的养护，分享洗娃娃的经历和未来计划。",
    "cooldownMs": 10368000000,
    "guidance": "讨论娃娃的养护，分享洗娃娃的经历和未来计划。"
  },
  {
    "id": "lysk-idle-42047327321d7854e82b",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "占卜与理性判断的玩笑",
    "cooldownMs": 10368000000,
    "guidance": "围绕占卜里不太可靠的提示，聊聊理性判断和一点无伤大雅的玩笑。"
  },
  {
    "id": "lysk-idle-52ec776c59c89aafc4c5",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "香包的感官关照",
    "cooldownMs": 10368000000,
    "guidance": "把香包的气味、触感和随身携带方式当成感官话题，保留温和关照的语气。"
  },
  {
    "id": "lysk-idle-5874628156f2cc5b99b1",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "杯子",
    "cooldownMs": 10368000000,
    "guidance": "讨论杯子的用途，顺便提一下颜色和裂痕。"
  },
  {
    "id": "lysk-idle-5f24f095bc3206f5add4",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "忙碌后的微小乐趣",
    "cooldownMs": 10368000000,
    "guidance": "围绕结束忙碌后想保留的一点小乐趣，写成轻松又可停的闲聊入口。"
  },
  {
    "id": "lysk-idle-60b19d7a4ab6c8c4c639",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "阳光与手工花的观察",
    "cooldownMs": 10368000000,
    "guidance": "以阳光下的小植物与手工花为话题，带点观察细节的轻松分享。"
  },
  {
    "id": "lysk-idle-6d8234ed835898181260",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "游戏选择的直觉讨论",
    "cooldownMs": 10368000000,
    "guidance": "把游戏里一个难以取舍的选择，延展成关于直觉与后果的轻松讨论。"
  },
  {
    "id": "lysk-idle-8621c10f13efce5c9c70",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "夜间放松的克制关照",
    "cooldownMs": 10368000000,
    "guidance": "围绕夜间放松方式的细微差别，写成短句、克制的日常关照方向。"
  },
  {
    "id": "lysk-idle-866acf853c78bb7b83af",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "夜间独处的放松选择",
    "cooldownMs": 10368000000,
    "guidance": "以夜间独处的放松选择为话题，用短句和轻缓节奏展开。"
  },
  {
    "id": "lysk-idle-97f2b2af426377a4507d",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "小木箱的用途猜测",
    "cooldownMs": 10368000000,
    "guidance": "围绕一个看不透用途的小木箱，展开细节观察与物件用途的理性猜测。"
  },
  {
    "id": "lysk-idle-9af48780fc27b4f2879c",
    "charId": "builtin-zayne",
    "openerClass": "playful_prompt",
    "semanticCluster": "具体互动：轻声分享一个关于气味和记忆的小故事。",
    "cooldownMs": 10368000000,
    "guidance": "轻声分享一个关于气味和记忆的小故事。"
  },
  {
    "id": "lysk-idle-9f72319aabd1b465c8b9",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "小动物编号的玩笑投票",
    "cooldownMs": 10368000000,
    "guidance": "围绕两只编号不同的小动物，设计一场认真投票又带点玩笑的偏好讨论。"
  },
  {
    "id": "lysk-idle-9f832b6930b10b93df29",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "具体互动：聊照片中的马和它们的关系，分享观察到的细节。",
    "cooldownMs": 10368000000,
    "guidance": "聊照片中的马和它们的关系，分享观察到的细节。"
  },
  {
    "id": "lysk-idle-a039552e79f90d166233",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "食物与恢复节奏的关照",
    "cooldownMs": 10368000000,
    "guidance": "围绕食物与恢复节奏的搭配，写成克制、可拒绝的日常关照。"
  },
  {
    "id": "lysk-idle-a2442722a2364298e49c",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "具体互动：轻声分享一个轻松的小互动点子，比如关于柠檬和消毒水的化学反应带来的幽默感。",
    "cooldownMs": 10368000000,
    "guidance": "轻声分享一个轻松的小互动点子，比如关于柠檬和消毒水的化学反应带来的幽默感。"
  },
  {
    "id": "lysk-idle-bb15406c7e89168978f1",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "小动画里的隐藏玩笑",
    "cooldownMs": 10368000000,
    "guidance": "围绕一段风格古怪的小动画，聊其最抓人的细节或隐含的玩笑。"
  },
  {
    "id": "lysk-idle-c447f4e2895e050b1e84",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "房车旅行的路径想象",
    "cooldownMs": 10368000000,
    "guidance": "以房车旅行的路径选择和野外停留方式为题材，保留对未知风景的向往与审慎判断。"
  },
  {
    "id": "lysk-idle-c9d301363d92c73b1e55",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "小海獭与休息提醒",
    "cooldownMs": 10368000000,
    "guidance": "把一只黏土小海獭和不太严肃的休息提醒放在一起，展开轻松照看的小话题。"
  },
  {
    "id": "lysk-idle-c9f365e94a479ee71170",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "具体互动：整理家里的摆件和挂饰，看看有没有好用的收纳方法。",
    "cooldownMs": 10368000000,
    "guidance": "整理家里的摆件和挂饰，看看有没有好用的收纳方法。"
  },
  {
    "id": "lysk-idle-ce6e81fb83b44938f140",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "极地馆",
    "cooldownMs": 10368000000,
    "guidance": "聊聊极地馆的有趣小故事，顺便提一下那只冲浪企鹅。"
  },
  {
    "id": "lysk-idle-e74cffc188092964431d",
    "charId": "builtin-zayne",
    "openerClass": "low_pressure_share",
    "semanticCluster": "两种消遣的比较玩笑",
    "cooldownMs": 10368000000,
    "guidance": "把一晚的空闲时间拆成两种截然不同的消遣，带点比较和玩笑地展开。"
  },
  {
    "id": "lysk-idle-edaf7dbdcd6919a9507f",
    "charId": "builtin-zayne",
    "openerClass": "other",
    "semanticCluster": "具体互动：讨论雪房子装饰，分享堆雪房子的经历。",
    "cooldownMs": 10368000000,
    "guidance": "讨论雪房子装饰，分享堆雪房子的经历。"
  },
  {
    "id": "lysk-idle-00a80b8fd2a0f3504dc5",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "解压",
    "cooldownMs": 10368000000,
    "guidance": "聊聊解压玩具的感受。"
  },
  {
    "id": "lysk-idle-18fe98b16cde753770bf",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "技巧",
    "cooldownMs": 10368000000,
    "guidance": "聊聊新的Evol技巧，比如尝试隐身。"
  },
  {
    "id": "lysk-idle-1e8c9d9e9403306f2ac0",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "放松办法的玩笑比较",
    "cooldownMs": 10368000000,
    "guidance": "把放松这件事拆成几种不太正经的办法，带着比较和玩笑展开。"
  },
  {
    "id": "lysk-idle-1f9035f7881987ad0929",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "速度感与掌控感的比较",
    "cooldownMs": 10368000000,
    "guidance": "围绕一项带速度感的体验，比较刺激与掌控感各自吸引人的地方。"
  },
  {
    "id": "lysk-idle-2b758f1f077786c3e630",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "镜子与小摆件的布置想象",
    "cooldownMs": 10368000000,
    "guidance": "围绕会映出不同样子的镜子和小摆件，设计一段带点审美判断的布置想象。"
  },
  {
    "id": "lysk-idle-356b303848fae1c3e559",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "游戏",
    "cooldownMs": 10368000000,
    "guidance": "聊聊默契小游戏，比如你跳我伴奏。"
  },
  {
    "id": "lysk-idle-364fd7ca9e116a69424e",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "小猫适应环境的观察",
    "cooldownMs": 10368000000,
    "guidance": "围绕一只小猫适应新环境的细节，展开带点观察和想象的轻松话题。"
  },
  {
    "id": "lysk-idle-42ce9293abdbb384efbe",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "临时起意的小惊喜",
    "cooldownMs": 10368000000,
    "guidance": "把一个不必隆重的小惊喜写得像临时起意的乐趣，留出猜测空间。"
  },
  {
    "id": "lysk-idle-50c5b9317d3122952b10",
    "charId": "builtin-sylus",
    "openerClass": "light_question",
    "semanticCluster": "旧事回忆的保留判断",
    "cooldownMs": 10368000000,
    "guidance": "围绕一段不必说尽的旧事，展开带点保留与判断的回忆话题。"
  },
  {
    "id": "lysk-idle-6527b0dff9ebbbbd8eb2",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "棋类节奏的休闲选择",
    "cooldownMs": 10368000000,
    "guidance": "围绕飞行棋和跳棋的不同节奏，展开带点胜负心的休闲选择。"
  },
  {
    "id": "lysk-idle-67db84c8b8f09d27f781",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "花材摆放的手作判断",
    "cooldownMs": 10368000000,
    "guidance": "围绕花材的形状与摆放顺序，延展成带点审美判断的手作话题。"
  },
  {
    "id": "lysk-idle-6a4c2b051daa9f477ec6",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "容易误读的文字游戏",
    "cooldownMs": 10368000000,
    "guidance": "围绕一个容易误读的字或双关，设计带点较真的文字游戏。"
  },
  {
    "id": "lysk-idle-6d63c678b29936cadddd",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "约会",
    "cooldownMs": 10368000000,
    "guidance": "讨论一起玩侦探游戏的可能。"
  },
  {
    "id": "lysk-idle-75c865d8e84eaf429877",
    "charId": "builtin-sylus",
    "openerClass": "light_question",
    "semanticCluster": "降低风险的笃定关照",
    "cooldownMs": 10368000000,
    "guidance": "围绕如何把风险降下来，写出干脆的关照和几种可选择的做法。"
  },
  {
    "id": "lysk-idle-c9d387331a0a624ac56d",
    "charId": "builtin-sylus",
    "openerClass": "low_pressure_share",
    "semanticCluster": "小物与分享的笃定入口",
    "cooldownMs": 10368000000,
    "guidance": "围绕一件想留住的小物，带一点直接又不催促的分享提议。"
  },
  {
    "id": "lysk-idle-d1d228e4e346d20054cc",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "私人物品留下的痕迹",
    "cooldownMs": 10368000000,
    "guidance": "围绕一件私人物品留下的痕迹，展开关于用途和习惯的观察。"
  },
  {
    "id": "lysk-idle-ed5dfb66c66bb6ddbb71",
    "charId": "builtin-sylus",
    "openerClass": "low_pressure_share",
    "semanticCluster": "手作小物与轻松邀请",
    "cooldownMs": 10368000000,
    "guidance": "分享亲手制作的小物，带一点笃定的邀请感，留出挑选和继续聊的空间。"
  },
  {
    "id": "lysk-idle-ede1751d25ef0ab36e4b",
    "charId": "builtin-sylus",
    "openerClass": "other",
    "semanticCluster": "临时晚餐的惊喜联想",
    "cooldownMs": 10368000000,
    "guidance": "以一顿临时起意的晚餐为话题，带着还会有什么惊喜的好奇延展互动。"
  },
  {
    "id": "lysk-idle-05a83bafd4c4cfc21111",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "逛街偶遇的任性审美",
    "cooldownMs": 10368000000,
    "guidance": "围绕逛街时偶然发现的小东西，延展成有点任性的审美判断。"
  },
  {
    "id": "lysk-idle-13904d72aac91e5e64db",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "尚未命名的颜色",
    "cooldownMs": 10368000000,
    "guidance": "围绕一种尚未命名的颜色，延展命名方式与它可能携带的情绪故事。"
  },
  {
    "id": "lysk-idle-16346961e65557498608",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "具体互动：分享助眠小技巧，邀请朋友一起体验",
    "cooldownMs": 10368000000,
    "guidance": "分享助眠小技巧，邀请朋友一起体验"
  },
  {
    "id": "lysk-idle-169f5c2f6d3ed9dd2548",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "微小发现的收藏感",
    "cooldownMs": 10368000000,
    "guidance": "把一件微小却有趣的发现说得像值得收藏的灵感，留出追问空间。"
  },
  {
    "id": "lysk-idle-28bab467727727fc1c7d",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "电影书页的画面分享",
    "cooldownMs": 10368000000,
    "guidance": "围绕一部电影或一本书里最舍不得略过的段落，展开画面感和情绪的分享。"
  },
  {
    "id": "lysk-idle-2c27dbba2c60cae701f7",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "卡住小事的干脆关照",
    "cooldownMs": 10368000000,
    "guidance": "从一件暂时卡住的小事切入，用干脆的关照和可选择的协助方式展开。"
  },
  {
    "id": "lysk-idle-37dcf86e9f088a7cb596",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "具体互动：学习放松技巧，邀请朋友一起体验助眠小技巧",
    "cooldownMs": 10368000000,
    "guidance": "学习放松技巧，邀请朋友一起体验助眠小技巧"
  },
  {
    "id": "lysk-idle-39a11559eaac378076e3",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "便当细节里的惊喜",
    "cooldownMs": 10368000000,
    "guidance": "围绕便当里最不起眼却最想留下的一样东西，写成细节与惊喜的分享。"
  },
  {
    "id": "lysk-idle-3a228292e998cd4ef51b",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "海洋纪念物的联想",
    "cooldownMs": 10368000000,
    "guidance": "围绕海洋意象的纪念物，展开物件细节、收集理由与联想故事。"
  },
  {
    "id": "lysk-idle-3d0aff5a6885300ae779",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "围裙细节的创作联想",
    "cooldownMs": 10368000000,
    "guidance": "围绕围裙的颜色、图案或用途，延展成带点创作感的轻松讨论。"
  },
  {
    "id": "lysk-idle-4173e707ff55c38aba8f",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "带点幼稚的旧趣事",
    "cooldownMs": 10368000000,
    "guidance": "把一件带点幼稚的旧趣事，写成自我调侃和好奇追问的闲聊。"
  },
  {
    "id": "lysk-idle-53978d5d6e446dd3363e",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "小动物反应的俏皮猜想",
    "cooldownMs": 10368000000,
    "guidance": "用小动物的反应设计一个猜想或角色扮演式的小问题，语气俏皮。"
  },
  {
    "id": "lysk-idle-57007eee5919f7ca1cd6",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "节庆规矩的轻松想象",
    "cooldownMs": 10368000000,
    "guidance": "借一则小型节庆的奇怪规矩，聊聊各自会怎样庆祝。"
  },
  {
    "id": "lysk-idle-6d2bc19ce699b98224ba",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "真话假话的顽皮反转",
    "cooldownMs": 10368000000,
    "guidance": "把真话与假话的选择写成带点顽皮的语言游戏，保留反转空间。"
  },
  {
    "id": "lysk-idle-76776e85871cbbaefc3d",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "照片里的画面联想",
    "cooldownMs": 10368000000,
    "guidance": "从一张没舍得删的照片谈起，顺着画面联想聊起心情或故事。"
  },
  {
    "id": "lysk-idle-7cf132824abad9fe023e",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "具体互动：分享学习新技能的体验和感受，邀请朋友一起参与",
    "cooldownMs": 10368000000,
    "guidance": "分享学习新技能的体验和感受，邀请朋友一起参与"
  },
  {
    "id": "lysk-idle-825af659fddea67fb733",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "偷闲时的秘密创作",
    "cooldownMs": 10368000000,
    "guidance": "把偷闲时的小动作说得像一场秘密创作，带着自我调侃开启闲聊。"
  },
  {
    "id": "lysk-idle-8c321a63aa0788d420c1",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "画家观察自我的视角",
    "cooldownMs": 10368000000,
    "guidance": "围绕画家如何观察自我形象，延展镜面、视角与真实感之间的创作联想。"
  },
  {
    "id": "lysk-idle-9ffc741a60994143c910",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "具体互动：整理画具，邀请朋友一起参与",
    "cooldownMs": 10368000000,
    "guidance": "整理画具，邀请朋友一起参与"
  },
  {
    "id": "lysk-idle-a6d38fefb23046578a48",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "荒唐假设里的认真幽默",
    "cooldownMs": 10368000000,
    "guidance": "把救人和救鲨鱼放在同一个荒唐假设里，展开带点认真劲的幽默讨论。"
  },
  {
    "id": "lysk-idle-bac879a0a9c3c9aa76e2",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "零食取舍的夸张选择",
    "cooldownMs": 10368000000,
    "guidance": "把一大包零食的取舍写成有点夸张的选择题，带出轻松玩笑。"
  },
  {
    "id": "lysk-idle-cad9d6528d57815ef66d",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "海底传说的未尽片段",
    "cooldownMs": 10368000000,
    "guidance": "以古老海底传说中未被说尽的片段为题材，延展颜色、遗迹或人物选择的想象。"
  },
  {
    "id": "lysk-idle-d020aeee58f327521844",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "游乐园的感官细节",
    "cooldownMs": 10368000000,
    "guidance": "把游乐园里最容易让人走神的细节，写成带点色彩和感官的分享。"
  },
  {
    "id": "lysk-idle-db9fce303aa67919d707",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "虚拟海滩的换景联想",
    "cooldownMs": 10368000000,
    "guidance": "把虚拟海滩的光线和触感当作想象灵感，延展成一次换景式的轻松闲聊。"
  },
  {
    "id": "lysk-idle-f4108fa5fe49ad44ea53",
    "charId": "builtin-daily-companion",
    "openerClass": "low_pressure_share",
    "semanticCluster": "生命与长久保存的想象",
    "cooldownMs": 10368000000,
    "guidance": "围绕生命有限与长久保存的想象，提出带些好奇和玩笑的观点交换。"
  },
  {
    "id": "lysk-idle-f7882a0614be742b432b",
    "charId": "builtin-daily-companion",
    "openerClass": "other",
    "semanticCluster": "玩偶围成的绘画场景",
    "cooldownMs": 10368000000,
    "guidance": "以一群玩偶围成的小型绘画场景为题材，延展创作时的陪伴感与一点顽皮想象。"
  },
  {
    "id": "lysk-idle-0aacabaf3d124039ff1a",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "食物与未解小事的交替",
    "cooldownMs": 10368000000,
    "guidance": "围绕一件没想明白的小事与一道食物，交替用认真猜测和轻松分享展开。"
  },
  {
    "id": "lysk-idle-11032c0164e7ab6a03c6",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "明信片与留言内容选择",
    "cooldownMs": 10368000000,
    "guidance": "围绕一张寄不出去也能保存的明信片，展开地点联想与留言内容的选择。"
  },
  {
    "id": "lysk-idle-11822194a089d853a2cd",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "远近训练方式的比较",
    "cooldownMs": 10368000000,
    "guidance": "围绕远近两种训练方式的差别，展开带点较真的比较和轻松挑战。"
  },
  {
    "id": "lysk-idle-15eeb3a3231ef628f2f5",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "拍照",
    "cooldownMs": 10368000000,
    "guidance": "分享拍照时的状态和感觉。"
  },
  {
    "id": "lysk-idle-2b8845fbd88a1a338753",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "好运话题里的自我调侃",
    "cooldownMs": 10368000000,
    "guidance": "把转运小妙招和不太严肃的自我调侃放在一起，展开轻松的好运话题。"
  },
  {
    "id": "lysk-idle-32c444e7a966fd1d07d3",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "具体互动：分享一个关于失忆的小故事",
    "cooldownMs": 10368000000,
    "guidance": "分享一个关于失忆的小故事"
  },
  {
    "id": "lysk-idle-413c5ce775227d91c4ec",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "随便逛逛的地点偏好",
    "cooldownMs": 10368000000,
    "guidance": "围绕一个适合随便逛逛的地点，交换偏好和一个理由。"
  },
  {
    "id": "lysk-idle-48bc5fdfa8128c2ffc6a",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "禁入区域的探索想象",
    "cooldownMs": 10368000000,
    "guidance": "把一段禁入区域的传闻当作想象灵感，讨论光影与规则会怎样改变一次探索。"
  },
  {
    "id": "lysk-idle-4ee1c444cd0e84ad6737",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "常去小店的日常招呼",
    "cooldownMs": 10368000000,
    "guidance": "围绕常去小店里一个让人记住的招呼，展开温柔、克制的日常观察。"
  },
  {
    "id": "lysk-idle-5b22d78a59c394bbfd41",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "拼贴信的故事想象",
    "cooldownMs": 10368000000,
    "guidance": "围绕一封拼贴信里能拼出怎样的故事，带点温柔地讨论记忆如何被保存。"
  },
  {
    "id": "lysk-idle-5d1fec0056baef42d893",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "偶遇小物的偏好惊喜",
    "cooldownMs": 10368000000,
    "guidance": "围绕购物时偶然发现的小物，展开用途、偏好与一点轻松惊喜。"
  },
  {
    "id": "lysk-idle-638ddfe703427ac875a5",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "游乐场附近的探索选择",
    "cooldownMs": 10368000000,
    "guidance": "围绕游乐场附近不那么显眼的去处，带着探索感聊地点选择。"
  },
  {
    "id": "lysk-idle-6a08a6b0cb025d534661",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "省笔画艺名的玩笑",
    "cooldownMs": 10368000000,
    "guidance": "围绕一个故意取得很省笔画的艺名，调侃它背后的身份想象和小故事。"
  },
  {
    "id": "lysk-idle-6a23aac68e5cfdb6fa13",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "抽奖期待的运气玩笑",
    "cooldownMs": 10368000000,
    "guidance": "把抽奖时的期待和偶然性写成轻松的运气话题，带一点玩笑。"
  },
  {
    "id": "lysk-idle-7650cb392109ddf08aeb",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "同一小事的默契试探",
    "cooldownMs": 10368000000,
    "guidance": "把同一件小事可能有的两种反应，写成试探默契的轻松闲聊。"
  },
  {
    "id": "lysk-idle-7efefc4fb57f780d356c",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "具体互动：讨论游乐园嘉宾邀请和拍照事宜。",
    "cooldownMs": 10368000000,
    "guidance": "讨论游乐园嘉宾邀请和拍照事宜。"
  },
  {
    "id": "lysk-idle-8b6b0265af15e1979e58",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "抽奖",
    "cooldownMs": 10368000000,
    "guidance": "尝试再抽一次喵呜徽章。"
  },
  {
    "id": "lysk-idle-aa2be86a12be279b9f84",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "雨前清爽感的活动提议",
    "cooldownMs": 10368000000,
    "guidance": "把下雨前短暂的清爽感写成一次想动一动的提议，保留轻松的陪伴感。"
  },
  {
    "id": "lysk-idle-ab8f011ae88d409800b9",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "菌菇外形与味道猜想",
    "cooldownMs": 10368000000,
    "guidance": "围绕新奇菌菇的外形和味道猜想，带一点认真又不太认真的讨论。"
  },
  {
    "id": "lysk-idle-b3c7c576485af0d96621",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "找不同的观察谜题",
    "cooldownMs": 10368000000,
    "guidance": "把找不同的小细节变成轻松谜题，用观察与猜测展开互动。"
  },
  {
    "id": "lysk-idle-b5e51f022731fa6ff5aa",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "室内消磨时间的小选择",
    "cooldownMs": 10368000000,
    "guidance": "把在室内消磨时间的方式拆成几个轻松选择，保留随时改主意的余地。"
  },
  {
    "id": "lysk-idle-bc5bb699e5523c40169e",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "走失小动物的线索互动",
    "cooldownMs": 10368000000,
    "guidance": "围绕走失小动物留下的线索，设计一段温和的寻找与猜测互动。"
  },
  {
    "id": "lysk-idle-c9d67ef3129b476d4496",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "悄悄坚持的小习惯",
    "cooldownMs": 10368000000,
    "guidance": "围绕一个想悄悄坚持的小习惯，讨论它可能带来的微小变化。"
  },
  {
    "id": "lysk-idle-ce3093f3e7cf222cb572",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "默契形成的轻松试探",
    "cooldownMs": 10368000000,
    "guidance": "把同一件小事里的两种回应，写成关于默契如何形成的轻松试探。"
  },
  {
    "id": "lysk-idle-ceaea77f7533f82b7de4",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "像小动物住处的角落",
    "cooldownMs": 10368000000,
    "guidance": "围绕一个被布置得像小动物住处的角落，展开带点好奇的空间观察。"
  },
  {
    "id": "lysk-idle-ddb6dc99a97f6800cc6f",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "地图异常标记的猜测",
    "cooldownMs": 10368000000,
    "guidance": "围绕地图上一个异常醒目的标记，设计带点悬念的观察和猜测互动。"
  },
  {
    "id": "lysk-idle-dfc620e367091f627e93",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "具体互动：聊聊手柄充电线的捉迷藏游戏",
    "cooldownMs": 10368000000,
    "guidance": "聊聊手柄充电线的捉迷藏游戏"
  },
  {
    "id": "lysk-idle-e16cd537bea2e1cd772e",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "看电影",
    "cooldownMs": 10368000000,
    "guidance": "轻缓地分享一个轻松的电影推荐"
  },
  {
    "id": "lysk-idle-e4a309eea92406d876d9",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "具体互动：聊手环的使用和管理技巧",
    "cooldownMs": 10368000000,
    "guidance": "聊手环的使用和管理技巧"
  },
  {
    "id": "lysk-idle-e7a0a7e261a4cf70068b",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "陌生口味的第一印象",
    "cooldownMs": 10368000000,
    "guidance": "围绕一种陌生口味的第一印象，展开好奇、犹豫与细微口感的观察。"
  },
  {
    "id": "lysk-idle-e7faf80f9e464488e754",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "作息里被忽略的小段",
    "cooldownMs": 10368000000,
    "guidance": "把作息里最容易被忽略的一小段拿来比较，写成温柔的日常互相了解。"
  },
  {
    "id": "lysk-idle-e89dfcacb942939e4063",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "具体互动：讨论抽奖经验并提出改进建议",
    "cooldownMs": 10368000000,
    "guidance": "讨论抽奖经验并提出改进建议"
  },
  {
    "id": "lysk-idle-ee23c89e4b5e636276b0",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "游戏",
    "cooldownMs": 10368000000,
    "guidance": "讨论游戏中的神秘岛屿。"
  },
  {
    "id": "lysk-idle-f689a0f094961d07432c",
    "charId": "builtin-xavier",
    "openerClass": "low_pressure_share",
    "semanticCluster": "陌生甜点的品尝想象",
    "cooldownMs": 10368000000,
    "guidance": "围绕一种陌生甜点的口感和名字，展开带点好奇的品尝想象。"
  },
  {
    "id": "lysk-idle-f699a0b79ac137bb0cd2",
    "charId": "builtin-xavier",
    "openerClass": "other",
    "semanticCluster": "小设备闹脾气的日常玩笑",
    "cooldownMs": 10368000000,
    "guidance": "围绕家用小设备突然闹脾气的情形，写成带点无奈和玩笑的日常互动。"
  },
  {
    "id": "lysk-idle-041ad39b349a92e28899",
    "charId": "builtin-caleb",
    "openerClass": "low_pressure_share",
    "semanticCluster": "盯屏幕后的感官转换",
    "cooldownMs": 10368000000,
    "guidance": "把长时间盯屏幕后的短暂放松，写成轻巧的感官转换或小游戏方向。"
  },
  {
    "id": "lysk-idle-0a5ce03e7443db2b3705",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "用旧电器的偏好交换",
    "cooldownMs": 10368000000,
    "guidance": "围绕一件用旧的小电器，交换功能偏好和舍不得更换的理由。"
  },
  {
    "id": "lysk-idle-2167f53bf38378fda07c",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "具体互动：分享小物件背后的故事，聊聊快递和纪念品",
    "cooldownMs": 10368000000,
    "guidance": "分享小物件背后的故事，聊聊快递和纪念品"
  },
  {
    "id": "lysk-idle-3879947f045df8992d7c",
    "charId": "builtin-caleb",
    "openerClass": "low_pressure_share",
    "semanticCluster": "飞行前的兴奋想象",
    "cooldownMs": 10368000000,
    "guidance": "围绕第一次飞行前的兴奋与一点点夸张想象，写成轻松的出发话题。"
  },
  {
    "id": "lysk-idle-45324fcdab323bd41dff",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "具体互动：提议制作一个有趣的饮品挑战赛",
    "cooldownMs": 10368000000,
    "guidance": "提议制作一个有趣的饮品挑战赛"
  },
  {
    "id": "lysk-idle-45bbbe14b4fd64038c3d",
    "charId": "builtin-caleb",
    "openerClass": "low_pressure_share",
    "semanticCluster": "显眼配饰的线索互动",
    "cooldownMs": 10368000000,
    "guidance": "把寻找一件显眼配饰的过程，写成带点默契和玩笑的线索互动。"
  },
  {
    "id": "lysk-idle-4eec209dea820c1feb65",
    "charId": "builtin-caleb",
    "openerClass": "playful_prompt",
    "semanticCluster": "挑战体验的玩笑邀约",
    "cooldownMs": 10368000000,
    "guidance": "聊聊一项略带失重感的挑战，用玩笑把想试试与先观望都留成可选择的下一步。"
  },
  {
    "id": "lysk-idle-5e1138a1b53d0e96f965",
    "charId": "builtin-caleb",
    "openerClass": "low_pressure_share",
    "semanticCluster": "总会失踪的小物玩笑",
    "cooldownMs": 10368000000,
    "guidance": "围绕一件总会莫名失踪的小物，展开带点熟悉感的日常玩笑。"
  },
  {
    "id": "lysk-idle-5e8dde754ff99d856b2f",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "具体互动：分享背后的故事，拍照时的心情",
    "cooldownMs": 10368000000,
    "guidance": "分享背后的故事，拍照时的心情"
  },
  {
    "id": "lysk-idle-730605c0edaa886eb9da",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "酸味食物的感官玩笑",
    "cooldownMs": 10368000000,
    "guidance": "围绕酸味食物带来的表情变化，写成轻松又有点调皮的感官话题。"
  },
  {
    "id": "lysk-idle-7818fa53f382d45d1a28",
    "charId": "builtin-caleb",
    "openerClass": "low_pressure_share",
    "semanticCluster": "电子相册的画面联想",
    "cooldownMs": 10368000000,
    "guidance": "围绕电子相册里一张容易让人停住的画面，展开照片如何留住感觉的联想。"
  },
  {
    "id": "lysk-idle-7ea6bb3b420f32b0903c",
    "charId": "builtin-caleb",
    "openerClass": "playful_prompt",
    "semanticCluster": "慢慢写完的一封信",
    "cooldownMs": 10368000000,
    "guidance": "围绕一封需要慢慢写完的信，延展成寄出前反复斟酌的内容选择。"
  },
  {
    "id": "lysk-idle-815f1b6d5e0a7c1774ea",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "收藏品的审美想象",
    "cooldownMs": 10368000000,
    "guidance": "围绕几件难以取舍的收藏，展开审美判断和送礼心意的想象。"
  },
  {
    "id": "lysk-idle-8d3d4005875de3aa25b7",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "小鸟",
    "cooldownMs": 10368000000,
    "guidance": "讨论小鸟的新位置和飞行能力"
  },
  {
    "id": "lysk-idle-97aff0c531cc3d6cf2cb",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "具体互动：提议午餐吃什么，一起尝试新奇的活动",
    "cooldownMs": 10368000000,
    "guidance": "提议午餐吃什么，一起尝试新奇的活动"
  },
  {
    "id": "lysk-idle-9c411753692045713d2d",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "消失字迹的短暂痕迹",
    "cooldownMs": 10368000000,
    "guidance": "围绕会消失的字迹如何改变留言的意义，展开物件机制与短暂痕迹的想象。"
  },
  {
    "id": "lysk-idle-a179c6b9e5f0d745f683",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "练习后的细微变化",
    "cooldownMs": 10368000000,
    "guidance": "围绕练习后身体感受的细微变化，延展成轻松、克制的分享与观察。"
  },
  {
    "id": "lysk-idle-a2be8d759689dca6680f",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "神秘坐标的方向猜测",
    "cooldownMs": 10368000000,
    "guidance": "围绕一串看似神秘的坐标，延展成方向感与想象力的猜测。"
  },
  {
    "id": "lysk-idle-b0e25e0db1151d47ccd4",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "卡牌组合的策略玩笑",
    "cooldownMs": 10368000000,
    "guidance": "围绕一套卡牌的出牌顺序和意外组合，设计带点策略感的玩笑讨论。"
  },
  {
    "id": "lysk-idle-b2e38e46065d16a6eeb1",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "具体互动：关于新年红包的小互动，讨论如何表达心意。",
    "cooldownMs": 10368000000,
    "guidance": "关于新年红包的小互动，讨论如何表达心意。"
  },
  {
    "id": "lysk-idle-b3bc198e979afa97b3b7",
    "charId": "builtin-caleb",
    "openerClass": "playful_prompt",
    "semanticCluster": "深空隧道",
    "cooldownMs": 10368000000,
    "guidance": "讨论深空隧道内部情况"
  },
  {
    "id": "lysk-idle-cf3c0daa6190dbbab759",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "未完成立体拼图的联想",
    "cooldownMs": 10368000000,
    "guidance": "围绕一项没拼完的立体拼图，延展成形状、耐心和下一块去处的猜测。"
  },
  {
    "id": "lysk-idle-da20a65d66b233c0c517",
    "charId": "builtin-caleb",
    "openerClass": "low_pressure_share",
    "semanticCluster": "体检数字的克制话题",
    "cooldownMs": 10368000000,
    "guidance": "围绕体检报告里一项让人犹豫的数字，写成轻松、克制的健康话题。"
  },
  {
    "id": "lysk-idle-db85ec217b50b7fcfb0a",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "情书",
    "cooldownMs": 10368000000,
    "guidance": "聊聊捡到的情书背后的故事"
  },
  {
    "id": "lysk-idle-dfa9041955832a4e2b1e",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "衣服轮廓与新搭配",
    "cooldownMs": 10368000000,
    "guidance": "围绕一套衣服的轮廓或颜色，展开敢不敢尝试新搭配的轻松想象。"
  },
  {
    "id": "lysk-idle-edd5a7d9cd055e4e4a32",
    "charId": "builtin-caleb",
    "openerClass": "playful_prompt",
    "semanticCluster": "洗衣液",
    "cooldownMs": 10368000000,
    "guidance": "分享洗衣液配方和闻起来的感觉"
  },
  {
    "id": "lysk-idle-efbe495cec6856b0ae23",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "互动页面的隐藏反应",
    "cooldownMs": 10368000000,
    "guidance": "以带有小机关的互动页面为题材，保留探索隐藏反应时的轻松好奇。"
  },
  {
    "id": "lysk-idle-f688c61b7ba2d5891d5a",
    "charId": "builtin-caleb",
    "openerClass": "other",
    "semanticCluster": "纪念品与巡游的想象",
    "cooldownMs": 10368000000,
    "guidance": "围绕一件小纪念品和热闹巡游的想象，写出带点兴奋的节庆话题。"
  }
] as const;

export const BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES: readonly BuiltInIdleDirectLine[] = DIRECT_SPECS;

export const BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL: readonly CompanionMaterialRecord[] = REWRITE_SPECS.map(spec => ({
  schemaVersion: COMPANION_MATERIAL_SCHEMA_VERSION,
  id: spec.id,
  ownerScope: { kind: 'character', charId: spec.charId },
  charId: spec.charId,
  kind: 'proactive_seed',
  slot: 'proactive_seeds',
  guidance: spec.guidance,
  renderPolicy: 'transform_required',
  knowledge: 'char_private',
  continuity: 'canon',
  eligibleModes: ['proactive_letter'],
  eligiblePurposes: ['proactive_intent'],
  tags: [...new Set(['proactive_intent', 'opening', spec.openerClass, spec.semanticCluster].filter(Boolean))],
  retrievalHints: {
    activationPolicy: 'relevance_required',
    positiveSignals: ['proactive_intent', 'opening'],
    suppressSignals: ['care_needed'],
    variationGroup: 'idle_' + spec.id.slice(-20),
    fallbackPriority: 0,
  },
  groundingPolicy: {
    allOf: [
      { kind: 'wakeup_rule', claimKey: 'proactive_intent' },
      { kind: 'wakeup_rule', claimKey: 'hidden_words_enabled' },
    ],
  },
  cooldownMs: spec.cooldownMs,
  sourceRefs: [{
    storeFamily: 'built_in_runtime',
    recordId: spec.id,
    revision: 1,
    sourceFingerprint: 'compiled-' + spec.id,
    sourcePackId: RUNTIME_PACK_ID,
  }],
  status: 'active',
  createdAt: REVIEWED_AT,
  updatedAt: REVIEWED_AT,
  revision: 1,
}));

export const builtInDeepspaceIdleDirectLinesForCharacter = (
  charId: string,
): readonly BuiltInIdleDirectLine[] => (
  BUILT_IN_DEEPSPACE_IDLE_DIRECT_LINES.filter(line => line.charId === charId)
);

export const builtInDeepspaceIdleRewriteMaterialForCharacter = (
  charId: string,
): readonly CompanionMaterialRecord[] => (
  BUILT_IN_DEEPSPACE_IDLE_REWRITE_MATERIAL.filter(record => record.charId === charId)
);

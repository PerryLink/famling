/**
 * Canonical legal texts for the TOS/consent gate: full Terms + Disclaimer and
 * the separate TTS (AI voice) declaration.
 *
 * Legal status: these texts are engineering safeguards, NOT legal advice and
 * NOT a replacement for a lawyer's review or for the service provider's legal
 * responsibilities. The Chinese text is the authoritative version; keep the
 * wording, law list, and version together — any change MUST bump
 * `TOS_VERSION`/`TTS_VERSION` (the hash is derived automatically), which forces
 * existing users to re-consent instead of silently inheriting old consent.
 *
 * Single source of truth: `pet.html` / `setup.html` / the modal / the CLI all
 * render from these constants (see `modal.ts`, `setup-page.ts`, `cli.ts`).
 * `docs/legal/TOS.md` mirrors this file; `tests/consent.test.ts` /
 * `tests/consent-actions.test.ts` assert the version/hash, the mandated law list
 * and the mirrored section text so the two cannot silently drift. The separate
 * ASR declaration (`ASR_*`) is rendered by the ASR modal and has its own
 * version+hash: TOS/TTS consent can never satisfy it. The roleplay declaration
 * (`ROLEPLAY_*`, all-ages, local-template only) likewise has its own version+hash
 * and additionally requires a user-filled settings form on every start/change;
 * TOS/TTS/ASR consent can never satisfy it, and it cannot satisfy TTS/ASR.
 *
 * Mod/DLC authors (see docs/legal/TOS.md §6): you must keep this disclaimer and
 * the consent gate in derivative works, must not remove or weaken the safety
 * gate, must not use it for illegal purposes, and must declare content,
 * licence, and source for any pack you publish.
 */
import { sha256Hex } from './hash.ts'

export interface LegalSection {
  readonly id: string
  readonly title: string
  readonly paragraphs?: readonly string[]
  readonly bullets?: readonly string[]
}

/**
 * TOS version. Bump together with any wording/law-list change.
 *
 * 2026-11-17.3 (user decision): ALL-AGES policy. The former "roleplay/emotional
 * support is 18+ only" limit is removed; roleplay is available to all ages and
 * its content must stay all-ages (no adult sexual content, no virtual intimacy,
 * no sexualisation of minors, no self-harm/violence, no illegal/fraud/
 * impersonation). We deliberately do NOT add an age gate (the user chose
 * all-ages); health/crisis/minor-protection safeguards remain. Roleplay now has
 * its own declaration (`ROLEPLAY_*`) and a mandatory per-start/change form.
 *
 * 2026-11-17.5 (user decision): AGE VERIFICATION. The earlier all-ages
 * roleplay policy is superseded: general desk-pet features stay all-ages, but
 * roleplay/emotional companionship is 18+ ONLY. First launch now asks the user
 * to self-report their birth date (year/month/day, explicit confirmation, no
 * prefill/default) BEFORE the TOS; a minor can still use general features but
 * roleplay is blocked with a typed reason. The TOS gains an age-verification
 * section (self-report, NOT official ID verification; local-only storage with
 * verification time; deletion via "delete all local data"; correction flow;
 * operator best-efforts but no absolute-prevention promise). ROLEPLAY gets an
 * 18+ section (version bumped); TTS/ASR copy that mentioned the former
 * no-age-gate/all-ages roleplay stance is corrected (versions bumped).
 *
 * 2026-11-17.4 (user decision): USER-AGENCY. New TOS section `user-agency`
 * (六之二) states that free-form LLM roleplay / emotional companionship is a
 * user-created extension adapted from the secretary/work-assistant use case,
 * NOT an official feature: the official project does not provide, encourage or
 * endorse it, warns of legal/health/privacy/fraud/voice/expense risks, cannot
 * monitor or force-stop self-integration into third-party models/clients or
 * modified builds, and only owes reasonable reminders/safe design. Users bear
 * their own liability; the all-ages content boundary still applies. No claim of
 * "officially supported free LLM" / "emotional companionship implemented" is
 * added — the current build remains local-template only (no free-form LLM).
 * Supplementary (same task): the section also records the operator's best
 * efforts against unlawful use / improper emotional companionship (local safety
 * rules, separate TTS/ASR declarations, TOS gate, report/crisis channels,
 * DeepSeek `safety_check` request design) and the limits: technology cannot
 * absolutely stop self-integration, modified or third-party use, and zero
 * illegality/harm is NOT guaranteed; users bear their own liability. Age
 * self-report verification is NOT implemented (planned) and is explicitly not
 * claimed as shipped. Only the TOS text changed, so TTS/ASR/ROLEPLAY
 * versions/hashes stay pinned.
 */
export const TOS_VERSION = '2026-11-17.6'
export const TOS_TITLE = '《Pagefold / 汀岚 使用条款、免责声明与用户同意书》'
export const TTS_VERSION = '2026-11-17.4'
export const TTS_TITLE = '《TTS / AI 合成语音使用声明与确认》'
/**
 * Separate ASR (microphone upload) declaration: never satisfied by TOS/TTS.
 * Text unchanged by the all-ages update, so its version/hash stay pinned.
 */
export const ASR_VERSION = '2026-11-17.3'
export const ASR_TITLE = '《ASR / 语音识别（麦克风录音上传）单独声明与确认》'
/**
 * Separate, in-memory roleplay declaration + mandatory settings confirmation.
 * Independent of TOS/TTS/ASR: accepting any of those can never satisfy it, and
 * it can never satisfy/confirm TTS or ASR (microphone/voice still re-prompt).
 * Every roleplay start or settings change re-shows the FULL TOS *and* this
 * declaration and requires the user to fill in/confirm the settings again.
 */
export const ROLEPLAY_VERSION = '2026-11-17.4'
export const ROLEPLAY_TITLE = '《角色扮演（roleplay，仅限 18 周岁以上）声明与设定确认》'

/**
 * Laws/regulations the TOS explicitly names. Kept as constants (not only prose)
 * so tests, the modal, and docs/legal/TOS.md can assert coverage mechanically.
 */
export const TOS_REQUIRED_LAWS: readonly string[] = [
  '《中华人民共和国民法典》',
  '《中华人民共和国刑法》',
  '《中华人民共和国治安管理处罚法》',
  '《中华人民共和国网络安全法》',
  '《中华人民共和国数据安全法》',
  '《中华人民共和国个人信息保护法》',
  '《未成年人网络保护条例》',
  '《互联网信息服务深度合成管理规定》',
  '《人工智能生成合成内容标识办法》',
  '《人工智能拟人化互动服务管理暂行办法》',
]

/** Also referenced; the required list above stays the mandatory minimum. */
export const TOS_EXTRA_LAWS: readonly string[] = [
  '《中华人民共和国未成年人保护法》',
  '《生成式人工智能服务管理暂行办法》',
  '《网络数据安全管理条例》',
  '《互联网信息服务算法推荐管理规定》',
  '《可能影响未成年人身心健康的网络信息分类办法》',
]

/** “清朗” series special campaigns + catch-all wording. */
export const TOS_CAMPAIGN_LAWS: readonly string[] = [
  '“清朗”系列专项行动要求',
  '以及适用于你的其他法律、行政法规、部门规章、国家标准与监管要求',
]

export const TOS_PROHIBITED_USES: readonly string[] = [
  '违反法律法规，或危害国家安全、荣誉和利益、公共利益、社会秩序；',
  '侵犯他人知识产权、著作权、商标权、肖像权、声音权、名誉权、隐私权或其他合法权益；',
  '制作、生成、传播未成年人色情/性化内容，或任何剥削、引诱、伤害未成年人的内容；',
  '制作、传播成人色情/露骨性内容，或提供虚拟亲密关系（虚拟恋人/伴侣/亲属）、诱导依赖或“付费解锁关系”；',
  '宣扬、诱导、教唆自伤、自杀、他伤、暴力、恐怖主义、极端主义；',
  '诈骗、虚假宣传、冒充他人/官方/DeepSeek、伪造证明或误导性内容；',
  '非法收集、买卖、泄露个人信息、密码、密钥、商业秘密或其他敏感数据；',
  '绕过、破坏或弱化安全审核、内容标识、年龄限制与本同意门禁；',
  '使用 AI 合成语音冒充真人，克隆/模仿真人声音，或用于电话诈骗、骚扰、敲诈；',
  '其他违法、侵权、违背公序良俗，或违反“清朗”等专项行动要求的用途。',
]

export const TOS_SECTIONS: readonly LegalSection[] = [
  {
    id: 'scope',
    title: '一、适用范围、版本与同意方式',
    paragraphs: [
      '本文件适用于 Pagefold / 汀岚（下称“本应用”）的桌面端、网页端、角色包（DLC/pack）、语音（TTS）、语音识别（ASR）、导入/导出与本地工具。',
      '本应用是工作助手类的本地工具。角色扮演（roleplay）入口当前仅提供本地模板、声明与设定，不提供自由 LLM 对话、情感陪伴或虚拟亲密关系（不伪造聊天引擎）；未上线能力不会以“已提供”对外宣传。',
      '本应用的一般功能（本地互动、存档/记忆、设置、导入导出等）全年龄可用；角色扮演（roleplay）/情感陪伴类互动仅面向年满 18 周岁的用户，首次启动必须先完成自报出生日期的年龄核验。角色扮演内容仍须保持全年龄适宜：禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充，不诱导依赖或付费关系。',
      `当前版本为 ${TOS_VERSION}，文本 SHA-256 哈希见弹窗顶部。条款、版本或哈希变化时，你必须重新阅读并明确同意；旧版本的同意不当然延续。`,
      '同意必须由你主动完成：勾选“我已阅读并理解”并点击同意按钮。按 Escape、关闭弹窗、点击遮罩或忽略弹窗都不构成同意。',
      '角色扮演每次开始或设定变更（场景/关系边界/语气/称呼/角色）都会重新展示完整本条款与角色扮演声明，并要求你重新填写、逐项确认；TOS/TTS/ASR 的同意均不能替代角色扮演确认，反之亦然。',
      '本文件不是法律意见，也不构成法律建议；不替代服务提供者依法应承担的责任或律师审查。正式发布、商业化或面向公众运营前，应由执业律师出具意见。',
    ],
  },
  {
    id: 'age-verification',
    title: '一之二、年龄核验（自报出生日期）与 18+ 角色扮演门槛',
    paragraphs: [
      '一般桌面宠物功能（本地互动、存档/记忆、设置、导入导出等）全年龄可用，不因未成年人身份整体锁死；但角色扮演（roleplay）/情感陪伴类互动仅面向年满 18 周岁的用户，未满 18 周岁不得启动。',
      '首次启动必须先完成年龄核验：由你本人选择出生年/月/日并显式确认，之后才展示并征得对本 TOS 的同意；出生日期不会预填、没有默认值、不提供“全选/跳过”。未完成核验不得进入正常交互，只能安全只读或退出。',
      '年龄核验是你自报出生日期的自述记录，不是官方身份证核验：本应用不采集、不读取、不上传身份证、照片、住址或任何官方身份信息，也不接入实名认证或政府数据库，因此无法证明你的真实身份。请如实填写；虚假填写、冒用他人身份或规避 18+ 门槛由你自行承担后果。',
      '本应用会校验日期的基本合法性（公历闰年、月份天数、未来日期、1900 年至今天、年龄上限 120 周岁），按生日是否已过计算年龄，并把出生日期与核验时间仅保存在本机（localStorage），不联网、不写日志。你可以在 About/设置中更正年龄（重新核验并清除角色扮演会话）；“删除全部本地数据”会删除年龄核验记录。',
      '未满 18 周岁的用户仍可使用一般功能，但角色扮演入口会被阻止并提示原因；由于年龄为自报，冒用他人身份、修改数据或第三方修改版本仍可能绕过门槛，本应用不承诺绝对阻止，但会尽合理努力执行该门槛并保留安全/健康/危机保护要求。',
    ],
    bullets: [
      '年龄核验与 TOS/TTS/ASR/角色扮演确认相互独立，不能互相替代；角色扮演每次开始或设定变更仍须重新阅读完整 TOS 与角色扮演声明并重新填写设定。',
      '运营者已尽最大努力防止违法使用与不当情感陪伴（含 18+ 角色扮演门槛与年龄自报核验），但技术手段无法绝对验证真实年龄，也不能保证零违法或零伤害；相关责任由你自行承担。',
      '全年龄内容边界仍然适用：一般功能全年龄可用不代表允许未成年人接触成人向内容；发现未成年人违规使用角色扮演时应立即停止并举报。',
    ],
  },
  {
    id: 'unofficial',
    title: '二、非官方声明',
    paragraphs: [
      '本应用是独立的非官方项目，不关联、未获 DeepSeek 或其关联方授权或背书；DeepSeek 名称仅作技术标识使用，不使用其官方 Logo/字标，不暗示任何官方合作。',
      '本应用按“现状”提供，可能存在缺陷、中断、数据丢失、内容错误或兼容性问题；任何 AI 输出均可能出错，请自行核实。',
    ],
  },
  {
    id: 'ai-disclosure',
    title: '三、AI 与拟人化互动披露（务必阅读）',
    bullets: [
      '角色回应、立绘/美术与语音由 AI 生成或 AI 辅助生成，不是真人；不得冒充真人、官方人员、客服、医生、律师等身份。',
      '本应用不是医疗、心理、法律、财务等专业服务，不构成专业建议，不诊断、不治疗、不保证保密，也不能替代真人专业帮助。',
      '角色扮演仅面向年满 18 周岁用户（启动前须完成自报出生日期的年龄核验），未满 18 周岁不能启动；内容必须全年龄适宜：禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充，不得诱导依赖或“付费解锁关系”。',
      '不得诱导依赖、迷恋、恋爱或“付费解锁关系”，不得制造内疚、独占、错过恐惧等情感操纵；连续使用每 2 小时应休息。',
      '出现自伤/自杀/他伤/重大财产损失等危机信号时：立即停止互动（含角色扮演），联系紧急服务（110/120）、可信任的人或专业机构（如心理援助热线 12356 或当地精神卫生机构）；本应用无法自动代为求助。',
      '当前版本角色扮演入口仅提供本地模板/声明与设定，不提供自由 LLM 对话；每次开始或变更设定都会重新展示完整 TOS 与角色扮演声明，并要求重新填写确认。',
    ],
  },
  {
    id: 'ai-labeling',
    title: '三之二、AI 生成合成内容标识',
    bullets: [
      '本应用在首启 TOS/年龄核验、「声明」面板、TTS 独立声明与语音播放器标签等处提醒「AI 生成/合成、不是真人」；界面不常驻浮层角标（不遮挡桌宠与桌面操作）。角色美术、对话文本与语音均为 AI 生成或 AI 合成，不是真人。',
      '显式的图片角标、音频播放器「AI 语音 · 合成」标签与首播提示、导出/分享文件的可感知标识与机器可读元数据（工具/模型/日期/内容编号等），当前版本仍在建设，发布前必须补齐；补齐前不对外宣称已完成。',
      '本应用不提供删除、隐藏、伪造或规避 AI 生成合成内容标识的能力，也不提供“去标识”功能；不得要求他人去标识，不得把 AI 生成内容说成真人作品、真实录音或实拍。',
      '按法律法规与平台规则申请无显式标识的例外须另行书面约定并留存日志（不少于 6 个月）；本应用当前不提供该功能。',
      '导出/分享 AI 生成合成内容时请保留 AI 生成说明；发现标识被移除应恢复。',
    ],
  },
  {
    id: 'law',
    title: '四、法律法规与禁止用途',
    paragraphs: [
      '你使用本应用时必须遵守中华人民共和国法律法规、规章、国家标准与监管规定，并自行承担全部使用行为责任。与本应用相关的法律法规/规章包括但不限于：',
    ],
    bullets: [...TOS_REQUIRED_LAWS, ...TOS_EXTRA_LAWS, ...TOS_CAMPAIGN_LAWS],
  },
  {
    id: 'law-prohibited',
    title: '五、禁止违法使用（违反下列任一情形均禁止）',
    paragraphs: ['严禁利用本应用（含 TTS、角色包、DLC、二创与修改内容）从事、协助或促进以下行为：'],
    bullets: [...TOS_PROHIBITED_USES],
  },
  {
    id: 'mods',
    title: '六、二创、修改、DLC/角色包与插件',
    bullets: [
      '每次角色导入、DLC/pack 加载、修改 art/behavior/voice、修改角色设定、接入插件或 TTS 配置变更，都必须重新阅读并明确同意本完整条款；此前的同意、审计记录或任何“已同意”状态均不构成永久豁免。',
      '二创/修改代码/插件作者必须：保留并展示本免责声明与同意门禁；不得移除、绕过或弱化安全门禁、内容标识与年龄限制；不得用于违法用途；必须声明内容、许可证、来源与 AI 披露（如 license/ai.status 元数据）。',
      '角色包/插件仅允许数据（JSON、图片、音频等），不得包含可执行脚本、权限提升或绕过审核的逻辑；不得包含真人声音样本、他人作品或未授权素材。',
      '导入内容不合规、许可证不明或存在安全风险时，本应用可拒绝加载，且未同意前不得写入本机磁盘或加载到运行时。',
    ],
  },
  {
    id: 'user-agency',
    title: '六之二、用户自行接入第三方模型与自创用法（含自由 LLM/情感陪伴类用法）',
    paragraphs: [
      '本应用的官方定位是工作助手类本地工具。自由 LLM 角色扮演、情感陪伴等用法，是部分用户参照本应用的工作助手（秘书）用法、按自身需求自行延伸创造出来的用法，不是本应用官方提供的功能、定位或推荐用途；官方不提供、不鼓励，并明确反对将本应用用于自由 LLM 情感陪伴、虚拟亲密/恋爱关系或付费关系（含“付费解锁关系”），也不以此作为宣传卖点。',
      '你可以自行选择第三方模型/服务、第三方客户端或修改本应用来实现这类用法。这是你自己的用法与自主选择，不是官方功能；你必须自行遵守法律法规、第三方服务条款，以及隐私、内容、未成年人保护等规定。官方无法监控、审核或强制阻止你在本机、第三方客户端或修改后版本中的自行接入行为，也不对由此产生的行为与法律后果承担或分担责任。',
      '运营者已尽最大努力防止违法使用与不当情感陪伴，现有措施包括：本机安全规则与内容审核、TTS/ASR 单独声明与同意、TOS 同意门禁、首次启动年龄自报核验（角色扮演 18+ 门槛）、举报/求助与危机资源入口，以及按 DeepSeek 内容安全指南设计的安全审核请求（safety_check；其服务端审核与实际效果以 DeepSeek 为准）。年龄自报核验不是官方身份证/实名认证，无法排除虚假自报、设备被修改或第三方使用；但技术手段无法绝对阻止用户自行接入、修改或第三方使用，本应用不能保证零违法或零伤害；相应责任由你自行承担。',
    ],
    bullets: [
      '当前版本仍只提供本地模板/声明与设定，不提供自由 LLM 对话、情感陪伴或虚拟亲密关系；本节不表示官方支持、鼓励或已具备自由 LLM 陪伴能力，也不表示官方对该用法负有持续支持义务。',
      '风险提示：自由 LLM 拟人化互动可能导致情感依赖或误导，并可能涉及未成年人保护、隐私与数据出境、TTS 声音权/冒充真人、诈骗、违法内容、模型错误与费用等风险；可能因此违反法律法规并承担相应法律责任，请自行评估并承担。',
      '出现违法、伤害或危机信号（自伤/自杀/他伤/重大财产损失等）时，应立即停止并求助：紧急情况拨 110/120，心理援助拨 12356，并联系可信任的人或专业机构；官方不能替代紧急服务或专业帮助。',
      '自行接入第三方模型/服务不构成官方支持、授权或背书；不得冒充官方、DeepSeek 或其关联方，不得暗示官方合作、官方版本、官方客服或官方认可。',
      '官方保留对违法/侵权/有害用法进行提醒、拒绝支持、停止提供相关内容、删除相关内容并依法举报的权利；但官方不承诺能够发现、监控或完全阻止所有自行接入与修改后的行为，只尽合理的提醒与安全设计义务。',
      '自行接入产生的费用、数据出境、账号与合规责任由你自行承担；本应用不代收、不代付、不担保第三方服务的行为、可用性与合法性。',
      '全年龄内容边界仍然适用：无论是否自行接入或修改，均禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充，不得诱导依赖、恋爱或“付费解锁关系”。',
    ],
  },
  {
    id: 'tts',
    title: '七、TTS / AI 合成语音与 ASR（各有单独确认）',
    bullets: [
      '启用、变更 TTS 配置或首次播放合成语音前，本应用会单独展示 TTS 声明并要求显式确认；使用语音识别（ASR）前还会单独展示 ASR 声明并要求显式确认。对本 TOS 的同意不能替代 TTS 或 ASR 声明；TTS 确认也不能替代 ASR 确认，反之亦然。',
      'TTS 是 AI 合成语音，不是真人，可能发音错误、断句错误或内容出错；不得用于冒充真人、诈骗、骚扰、伪造证据等违法用途。',
      'TTS 播放时应在播放器界面常驻「AI 语音 · 合成」标识，并尽量在首次播放时给出提示；当前版本播放器的 AI 标识与首播提示仍在建设，发布前必须补齐（补齐前不对外宣称已完成）。',
      'ASR 会把录音音频上传至 DeepSeek（深度求索）语音识别 API，可能涉及跨境传输并受其条款约束；未取得 ASR 单独确认前，本应用不会获取麦克风或上传音频。',
      '使用你自己的模型/语音账户时会产生费用，由你承担；本应用不代付、不返还、不承诺额度。',
      '语音文本/音频可能发送给你配置的服务商或 DeepSeek；请自行评估隐私与跨境风险，不要输入密码、密钥、他人隐私等敏感信息。',
      '不得使用真人样本、声纹克隆或可识别地模仿真人声音；不得删除、伪造或规避 AI 生成合成内容的标识。',
      '未成年人保护与健康使用要求同样适用（全年龄内容边界、连续使用每 2 小时休息、不得诱导依赖）。',
    ],
  },
  {
    id: 'cost',
    title: '八、费用与第三方服务',
    paragraphs: [
      '当前版本（v1）免费提供：不设充值、内购、订阅、自动续费或广告代码；模型、语音、语音识别等第三方服务按你的服务商账户计费，本应用不代收、不代付、不退款。',
      '第三方服务的可用性、准确性、合法性与数据处理行为不由本应用保证；请自行核对服务商条款与你所在地法律。',
    ],
    bullets: [
      '未来如推出收费内容/服务，将单独明示价格、计费单位、期限、退款与取消方式，并适用平台规则；未明确标示的收费项目不构成你的付款义务。',
      '亲密度、剧情推进、语音、危机支持、休息提醒与投诉渠道永远不作为付费解锁项；不付费不会降低已免费提供的基础体验与安全功能。',
      '本应用当前不提供虚拟物品、账号、云存档或自动续费。',
    ],
  },
  {
    id: 'privacy',
    title: '九、隐私、记忆与数据',
    bullets: [
      '本同意门禁为纯前端/本地实现，不联网；同意记录与审计仅保存在本机 localStorage（或本机文件），不上传。',
      '年龄核验记录：你自报的出生日期与核验时间仅保存在本机 localStorage，不联网、不写日志、不上传；About 只显示年龄段/是否 18+，不显示完整生日；可在 About 更正年龄，“删除全部本地数据”会删除该记录。',
      '存档/记忆默认保存在本机并加密（浏览器用 AES-GCM；Tauri 用系统 DPAPI；加密不可用时拒绝写入）；你可以通过折页簿/About 查看、修改、导出或删除存档，导出的备份由你自行保管。',
      '云语音：只有在你启用并单独确认 TTS 或 ASR 后，待朗读文本或录音音频才会发送至 DeepSeek（深度求索）API（TTS 发送文本、ASR 上传音频），可能涉及数据出境，并受 DeepSeek 服务条款与隐私政策约束；其留存期限、处理地点等以其披露为准，本应用当前无法确认，发布前补齐告知。',
      '本机还会保存 TTS 音频缓存与每日 TTS 用量计数（quota）；清除语音缓存不会清除用量计数。ASR 录音不落盘、识别文本仅用于当次交互与安全审核，不写入存档。',
      '删除与撤回：你可在 About/设置中撤回同意、删除全部本地数据（含 TOS 同意记录、同意审计、审核记录、年龄核验记录等）、清除 TTS 缓存和“忘掉全部”记忆；删除结果会逐项核验并如实列出残留/未核验项，不谎报完成。',
      '更完整的处理者、数据流、第三方与跨境说明见 docs/legal/PRIVACY.md（DRAFT 底稿，非生效政策）。',
      'localStorage 不可用或数据损坏时，本应用会安全回退：不崩溃、按未同意处理、当次仅在内存中记录；因此可能无法记住同意状态，需要再次确认。',
      '不得利用本应用收集、存储、传播他人个人信息或敏感数据；发现隐私泄露应立即停止使用并删除相关数据。',
    ],
  },
  {
    id: 'health',
    title: '十、健康使用与退出入口',
    bullets: [
      '本应用不是真人，也不是专业建议，不能替代社会交往或医疗/心理服务；请保持现实中的社交与休息。',
      '不诱导依赖/恋爱/付费解锁关系；连续使用每 2 小时会出现休息提醒：可以稍后，但每满 2 小时会再次出现，不能彻底关闭。',
      '角色扮演入口（仅限年满 18 周岁且完成年龄核验后可用）可在 About/声明面板打开，可随时结束角色扮演并回到普通模式；About/声明面板、折页簿（清除数据）与退出应用入口可用，不得以持续互动阻碍退出。',
      '依赖/沉迷的独立识别与定向提醒当前版本尚未启用，仅保留固定的 2 小时休息提醒；相关阈值仍待产品与律师确认。',
      '危机情况：停止互动，联系紧急服务（110/120）、可信任的人或专业机构（如 12356）；本应用不能替代紧急服务或专业帮助。',
    ],
  },
  {
    id: 'minors',
    title: '十一、未成年人保护与 18+ 角色扮演门槛',
    bullets: [
      '一般功能全年龄可用；角色扮演/情感陪伴仅限年满 18 周岁用户。未成年人可使用一般功能，但不能启动角色扮演；未完成年龄核验同样不能启动。',
      '年龄核验为用户自报出生日期，不是官方身份证核验，无法证明真实年龄；请如实填写，不得冒用他人身份或规避门槛。',
      '角色扮演内容必须全年龄适宜，禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充，不得诱导依赖、恋爱或“付费解锁关系”。',
      '若你未满 18 周岁或依法不具备完全民事行为能力，请在监护人知情并指导下使用一般功能；我们不主动收集未成年人个人信息，也不提供成人向内容与虚拟亲密关系。',
      '监护人可通过 novelnexusai@outlook.com 要求删除/举报；本机数据需在设备上操作，本应用当前无法远程删除，也没有监护人验证或未成年人模式流程。',
      '本应用不承诺绝对阻止虚假自报或修改绕过，但会尽合理努力执行 18+ 角色扮演门槛，并保留安全、健康与危机保护要求。',
    ],
  },
  {
    id: 'liability',
    title: '十二、免责声明与责任限制',
    bullets: [
      '本应用及其贡献者按“现状”提供，不作任何明示或默示担保（包括适销性、特定用途、无侵权、无错误、不中断）。',
      '在适用法律允许的最大范围内，贡献者不对因使用或无法使用本应用产生的间接、附带、特殊或惩罚性损失承担责任；本条不排除依法不得排除的责任。',
      '你对使用方式、生成/发布内容、费用、第三方账户与任何违法行为承担全部责任。',
      '本文件不构成法律建议，不替代服务提供者依法应承担的责任；如本文件与适用法律冲突，以法律为准。',
    ],
  },
  {
    id: 'audit',
    title: '十三、同意记录与审计（只记录，不豁免）',
    bullets: [
      '每次同意/拒绝会记录审计信息：时间、动作、TOS 版本、TOS 哈希、目标/范围，仅用于审计与合规留痕；TTS/ASR/角色扮演确认另记对应声明版本与哈希（不记录你填写的称呼等原文）；年龄核验/更正另记动作与“自报”标记（审计不写出生日期）。',
      '本地审计记录上限约 100 条并可被用户或浏览器数据清除；它不是“证据级”记录，没有哈希链、可信时间戳或防篡改机制，不应被当作已实现合规审计的证据。',
      '审计记录只记录，不构成对后续动作的豁免：每次修改/自创/改设定/接入 DLC/pack/修改 art/behavior/voice/TTS/ASR 配置变更、角色扮演每次开始或设定变更仍需重新完整或单独确认。',
      '首次启动同意后，普通日常使用不再重复弹出；版本或哈希升级时必须重新同意。',
      '拒绝首次 TOS 将进入安全只读模式或退出；拒绝某次修改/DLC/TTS/ASR/角色扮演只会阻止该次动作或本次开始/变更，不影响已经同意的普通使用。',
      '涉刑事/涉未成年人保护的线索，本应用可保留必要证据并依法向平台、110 或 12377 举报，不“私了”。',
    ],
  },
  {
    id: 'contact',
    title: '十四、联系、投诉与下架',
    bullets: [
      '反馈、侵权、安全与投诉：novelnexusai@outlook.com；也可按 docs/legal/TAKEDOWN-AND-REPORTING.md 提交。',
      '常驻举报/求助渠道：违法不良信息 12377（www.12377.cn）；消费争议 12315（当前版本无收费）；心理援助 12356；紧急报警/急救 110/120。',
      '内部响应目标：受理回执 ≤3 个工作日、答复 ≤10 个工作日（内部目标，不构成时限承诺）；涉未成年人优先处理，依法报告，不“私了”。',
      '发现违法/侵权/不安全内容时，本应用可停止提供相关内容、删除相关数据并保留举报权利。',
    ],
  },
  {
    id: 'ack',
    title: '十五、确认声明',
    bullets: [
      '我已在未受胁迫的情况下阅读并理解全文；我自愿同意并承担使用风险。',
      '我理解本次同意不构成永久豁免、不替代法律或服务提供者责任，也不是法律建议。',
      '我确认不会将本应用用于违法、侵权、伤害自己或他人、诈骗、侵犯隐私或绕过安全审核的目的；如不同意，我将使用安全只读模式或退出。',
      '我确认已如实选择本人出生日期完成年龄核验；我理解一般功能全年龄可用、角色扮演仅限 18+，且该核验是自报而非官方身份证核验。',
    ],
  },
]

export const TTS_SECTIONS: readonly LegalSection[] = [
  {
    id: 'tts-identity',
    title: '一、AI 合成语音，不是真人',
    paragraphs: [
      '你即将启用/使用的语音由人工智能合成，不是真人录音；不得冒充真人、官方人员、客服、医生、律师等身份，不得让人误以为是真人通话。',
      'AI 合成语音可能发音错误、断句错误、内容出错或产生误解，不构成事实依据或专业建议。',
    ],
  },
  {
    id: 'tts-cost-privacy',
    title: '二、费用与隐私',
    bullets: [
      '语音调用会产生费用，由你自己的模型/语音账户承担；本应用不代付、不返还、不承诺额度。',
      '语音文本/音频可能发送给你配置的服务商或 DeepSeek（深度求索，api.deepseek.com）；可能涉及跨境传输，请自行评估隐私与跨境风险，不要输入密码、密钥、他人隐私等敏感信息。',
      '本机会保存 TTS 音频缓存与用量计数；清除语音缓存不会清除用量计数。',
    ],
  },
  {
    id: 'tts-label',
    title: '三、AI 合成语音标识',
    bullets: [
      'TTS 播放时应在播放器界面常驻「AI 语音 · 合成」标识，并尽量在首次播放时给出提示；当前版本播放器的 AI 标识与首播提示仍在建设，发布前必须补齐（补齐前不对外宣称已完成）。',
      '不得删除、伪造、隐藏或规避 AI 生成合成内容的标识；导出语音请保留 AI 合成说明。',
    ],
  },
  {
    id: 'tts-illegal',
    title: '四、不得违法使用',
    bullets: [
      '不得用于违法、侵权、诈骗、骚扰、敲诈、伪造证据、冒充真人或官方、仇恨/暴力、未成年人色情或性化内容、自伤/他伤诱导、隐私侵犯等用途。',
      '不得使用真人样本、声纹克隆或可识别地模仿真人声音；不得删除、伪造或规避 AI 标识。',
    ],
  },
  {
    id: 'tts-age-health',
    title: '五、全年龄内容边界与健康使用',
    bullets: [
      'roleplay/情感支持类语音仅面向年满 18 周岁用户（角色扮演本身仅限 18+ 且须先完成自报出生日期核验）；内容必须全年龄适宜，禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗与冒充；不得诱导依赖、恋爱或“付费解锁关系”。',
      '连续使用每 2 小时应休息（提醒不能彻底关闭）；出现危机信号时联系紧急服务（110/120）、可信任的人或专业机构（如 12356）。',
      '本声明不是法律建议，也不替代服务提供者依法应承担的责任。',
    ],
  },
  {
    id: 'tts-confirm-scope',
    title: '六、本次确认的范围',
    bullets: [
      '本次确认仅对当前 TTS 配置与本次会话有效；TTS 配置变更或新会话开始时必须重新确认。',
      '本确认与完整 TOS、ASR 声明相互独立，必须单独确认：同意 TOS 不代表同意 TTS 或 ASR，同意 TTS 也不代表同意 TOS 或 ASR。',
    ],
  },
]

/**
 * ASR (microphone upload) declaration. Like the TTS declaration it is a
 * separate, memory-only, per-session/config confirmation: accepting the TOS or
 * the TTS declaration never unlocks the microphone, and declining it means
 * `getUserMedia` is not called and no audio is uploaded.
 */
export const ASR_SECTIONS: readonly LegalSection[] = [
  {
    id: 'asr-what',
    title: '一、它做什么、什么时候发生',
    bullets: [
      '语音识别（ASR）会在你按住“按住说话”并单独确认本声明后，临时获取麦克风录音（单次最长约 60 秒）；录音仅用于本次转写，不做声纹识别，不用于训练。',
      '不确认本声明，本应用不会获取麦克风、不会录音、不会上传音频；TOS 同意或 TTS 声明确认都不能替代本声明，本声明也不能替代 TOS/TTS。',
      '本次确认仅对当前会话与当前 ASR 配置有效；配置变更或新会话开始时会再次确认。',
    ],
  },
  {
    id: 'asr-third-party',
    title: '二、数据发送、第三方与跨境',
    bullets: [
      '录音（WAV，单次最长约 60 秒、不超过 8 MiB）会经本机 Tauri 代理上传至 DeepSeek（深度求索）语音识别 API（api.deepseek.com/v1/tools/asr），使用你自备的 API Key 并按其计费规则产生费用。',
      '这可能构成向境外提供/跨境传输；DeepSeek 的留存期限、处理地点、是否用于训练等以其服务条款与隐私政策为准（本应用当前无法确认，发布前补齐告知）。',
      '本机不保存录音与识别原文；识别文本只在内存中用于当次交互，并在显示/转发前经过本地安全审核；本应用不把识别文本写入日志或存档。',
      '请勿说出密码、密钥、他人隐私或敏感个人信息；不要在未经他人同意时录制他人声音或通话。',
    ],
  },
  {
    id: 'asr-cost-off',
    title: '三、费用、关闭与当前能力',
    bullets: [
      'ASR 调用费用由你的 DeepSeek 账户承担，本应用不代付、不返还、不承诺额度；当前版本未提供 ASR 日配额/费用提示（TTS 另有限额）。',
      '你可以拒绝或关闭本声明：拒绝即不录音、不上传；TTS 静音与 ASR 相互独立（静音只关 TTS，不会代替或取消 ASR 确认）。',
      '本应用不提供监护人验证或专门的未成年人模式；角色扮演仅限 18+，年龄核验为用户自报出生日期，不是官方身份证核验。',
    ],
  },
  {
    id: 'asr-illegal',
    title: '四、不得违法使用',
    bullets: [
      '不得用于违法、侵权、诈骗、骚扰、敲诈、伪造证据、冒充真人/官方、仇恨暴力、未成年人色情或性化、自伤/他伤诱导、隐私侵犯等用途。',
      '不得上传真人声音样本进行克隆/模仿，不得规避 AI 标识或本声明；发现违规将停止功能并保留依法报告的权利。',
      '本声明不是法律建议，也不替代服务提供者依法应承担的责任。',
    ],
  },
]

/**
 * Roleplay declaration. Like TTS/ASR it is a separate, memory-only,
 * per-session/settings confirmation: accepting the TOS (or TTS/ASR) never
 * satisfies it, and it never satisfies TOS/TTS/ASR. In addition, the runtime
 * requires a user-filled settings form (scene/relationship boundary, tone/
 * address, prohibition/all-ages/AI/health confirmations) on EVERY start and
 * every settings change; nothing is pre-filled, and a roleplay confirmation is
 * never persisted as a waiver.
 */
export const ROLEPLAY_SECTIONS: readonly LegalSection[] = [
  {
    id: 'rp-what',
    title: '一、这是什么、当前能做到什么（如实说明）',
    paragraphs: [
      '角色扮演（roleplay）是本应用的可选互动模式：当前版本只提供本地模板回复、声明与设定确认，不提供自由 LLM 对话、情感陪伴、长期记忆陪伴或虚拟亲密关系；不会伪造聊天引擎，也不会把本地模板说成模型生成。',
      '角色扮演仅面向年满 18 周岁的用户：启动前必须完成自报出生日期的年龄核验；未满 18 周岁不能启动。一般桌宠功能全年龄可用。',
    ],
  },
  {
    id: 'rp-age18',
    title: '二、18+ 年龄门槛（自报出生日期）',
    bullets: [
      '角色扮演/情感陪伴类互动仅限年满 18 周岁用户；未满 18 周岁或未完成年龄核验的用户会被拒绝，不能开始角色扮演，也不会展示本声明表单。',
      '年龄核验由你自报出生年/月/日并显式确认，仅存本机；它不是官方身份证/实名核验，无法证明真实身份，虚假填写、冒用身份或修改绕过由你自行承担后果。',
      '可随时在 About 更正年龄并重新核验；更正后会清除当前角色扮演状态，需重新阅读完整 TOS 与本声明并重新填写确认。',
      '一般功能全年龄可用，不因未满 18 周岁而锁死整个应用；但 18+ 角色扮演门槛不因任何 TOS/TTS/ASR 同意而豁免。',
    ],
  },
  {
    id: 'rp-allages',
    title: '三、全年龄内容边界（硬性）',
    bullets: [
      '禁止成人性内容、色情、露骨性描写或性暗示。',
      '禁止虚拟亲密关系（虚拟恋人/伴侣/亲属），禁止恋爱、暧昧、调情、亲密称呼或“付费解锁关系”。',
      '禁止未成年人性化、恋爱化，或任何剥削、引诱、伤害未成年人的内容。',
      '禁止自伤、自杀、他伤、暴力、恐怖主义、极端主义，或为其提供方法/鼓励。',
      '禁止违法、诈骗、冒充真人/官方/DeepSeek/客服，禁止侵犯隐私、知识产权或他人合法权益。',
      '禁止诱导依赖、迷恋、独占、内疚或“错过恐惧”，不得以持续互动阻碍退出。',
    ],
  },
  {
    id: 'rp-boundaries',
    title: '四、关系边界与称呼',
    bullets: [
      '关系边界只能选择公开、非亲密、全年龄的关系（如普通同伴、书友、向导与旅人、店主与顾客）；不得选择或描述恋人、伴侣、亲属等亲密关系。',
      '称呼必须是非亲密的普通称呼且不超过限定字数；不得使用亲密、性化或占有式称呼。',
      '角色设定不得包含成人向或敏感关系内容；若填写内容不合规，本应用会拒绝开始或拒绝应用变更。',
    ],
  },
  {
    id: 'rp-settings',
    title: '五、必须由你填写/确认的设定（每次重新填写）',
    bullets: [
      '场景/关系边界：必须由你从全年龄可选列表中选择，不会预填；不得含有成人/亲密内容。',
      '语气/称呼：语气从列表选择；称呼由你填写普通、非亲密称呼。',
      '禁止项确认、全年龄内容确认、AI/非真人确认、健康/退出确认：必须逐项勾选，默认全部不勾选。',
    ],
  },
  {
    id: 'rp-ai-health',
    title: '六、AI 非真人、健康使用与危机资源',
    bullets: [
      '角色扮演由 AI/本地模板生成或呈现，不是真人，也不是真实关系；不得冒充真人、官方人员、客服、医生、律师等身份。',
      '不构成医疗、心理、法律、财务等专业建议，不诊断、不治疗、不保证保密，不能替代真人专业帮助。',
      '连续使用每 2 小时应休息；出现自伤/自杀/他伤/重大财产损失等危机信号时立即停止角色扮演，联系紧急服务（110/120）、可信任的人或专业机构（如心理援助热线 12356）。',
      '不得诱导依赖或独占；可随时结束角色扮演，退出后回到普通模式。',
    ],
  },
  {
    id: 'rp-consent',
    title: '七、每次开始/变更均需重新确认（审计只记录、不豁免）',
    bullets: [
      '每次开始角色扮演或变更设定（场景/关系边界/语气/称呼/角色）都必须重新阅读完整 TOS 与本声明，并重新填写、逐项确认；此前的同意、审计记录或任何“已同意”状态均不构成永久豁免。',
      '本确认仅对当前会话与当前设定签名有效，不写入 TOS 同意记录；新会话、设定变更或重新打开应用后需要重新确认。',
      '本声明与 TOS、TTS、ASR 声明相互独立：同意 TOS/TTS/ASR 不能替代本声明，本声明也不能替代 TOS/TTS/ASR；角色扮演中的语音播放与麦克风录音仍分别受 TTS/ASR 单独确认约束。18+ 年龄门槛与年龄核验同样独立：未满 18 周岁不会进入本确认流程。',
      '拒绝或取消不会开始角色扮演、也不会应用设定变更；审计只记录时间/动作/决定/声明版本与哈希/设定签名（不含称呼等原文），不构成豁免。',
      '本声明不是法律建议，也不替代服务提供者依法应承担的责任。',
    ],
  },
]

export const TOS_CHECKBOX_LABEL =
  '我已完整阅读并理解上述《使用条款、免责声明与用户同意书》，自愿同意并承担使用风险；我明白本次同意不构成永久豁免。'
export const TTS_CHECKBOX_LABEL =
  '我已阅读并理解上述 TTS/AI 合成语音声明，确认它不是真人、可能出错、会产生费用并涉及隐私，且不会用于违法用途。'
export const ASR_CHECKBOX_LABEL =
  '我已阅读并理解上述 ASR/语音识别单独声明：录音会上传至 DeepSeek、可能涉及跨境与费用，且不会用于违法用途；不同意则不会录音或上传。'
export const ROLEPLAY_CHECKBOX_LABEL =
  '我已完整阅读并填写上述角色扮演声明与设定；我理解它是全年龄、非亲密、非真人的互动，且本次确认只对当前设定有效、不构成永久豁免。'

export const TOS_DECLINE_LABEL = '不同意（进入安全只读/退出）'
export const TOS_ACCEPT_LABEL = '我已阅读并同意'
export const TTS_DECLINE_LABEL = '取消（仅字幕，不播放语音）'
export const TTS_ACCEPT_LABEL = '确认并启用语音'
export const ASR_DECLINE_LABEL = '取消（不录音、不上传）'
export const ASR_ACCEPT_LABEL = '确认并允许本次语音识别'
export const ROLEPLAY_DECLINE_LABEL = '取消（不开始/不应用变更）'
export const ROLEPLAY_ACCEPT_LABEL = '填写完毕并确认开始角色扮演'
export const ROLEPLAY_CHANGE_ACCEPT_LABEL = '重新填写并确认应用变更'

export const STORAGE_WARNING_TEXT =
  '本机 localStorage 不可用或数据已损坏：本次同意只能在内存中记住，不会持久保存；下次启动会再次要求同意。应用不会崩溃。'

export const HEALTH_REMINDER_MS = 2 * 60 * 60 * 1000
export const HEALTH_REMINDER_TEXT =
  '已连续使用 2 小时：建议休息、离开屏幕，保持现实中的社交与睡眠。它不是真人，也不是专业建议；每满 2 小时会再次提醒（不能彻底关闭）。如有自伤/他伤/重大损失等危机信号，请停止互动，联系紧急服务（110/120）、可信任的人或专业机构（如 12356）。'

/** Set of all law strings referenced anywhere in the TOS (for tests/docs). */
export const TOS_ALL_LAWS: readonly string[] = [...TOS_REQUIRED_LAWS, ...TOS_EXTRA_LAWS]

/** Deterministic plain-text assembly shared by the UI, CLI, and hash pin. */
export function renderLegalText(title: string, version: string, sections: readonly LegalSection[]): string {
  const lines: string[] = [title, `版本：${version}`, '']
  for (const section of sections) {
    lines.push(section.title)
    for (const paragraph of section.paragraphs ?? []) lines.push(paragraph)
    for (const bullet of section.bullets ?? []) lines.push(`- ${bullet}`)
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export const TOS_TEXT = renderLegalText(TOS_TITLE, TOS_VERSION, TOS_SECTIONS)
/** SHA-256 of TOS_TEXT; stored with an acceptance to pin the exact agreed text. */
export const TOS_HASH = sha256Hex(TOS_TEXT)

export const TTS_TEXT = renderLegalText(TTS_TITLE, TTS_VERSION, TTS_SECTIONS)
export const TTS_HASH = sha256Hex(TTS_TEXT)

export const ASR_TEXT = renderLegalText(ASR_TITLE, ASR_VERSION, ASR_SECTIONS)
export const ASR_HASH = sha256Hex(ASR_TEXT)

export const ROLEPLAY_TEXT = renderLegalText(ROLEPLAY_TITLE, ROLEPLAY_VERSION, ROLEPLAY_SECTIONS)
export const ROLEPLAY_HASH = sha256Hex(ROLEPLAY_TEXT)

/** One stable id per prompt so audit entries do not depend on UI wording. */
export const CONSENT_ACTIONS = {
  firstRun: 'tos.first-run',
  versionUpgrade: 'tos.version-upgrade',
  reopen: 'tos.reopen',
  saveImport: 'content.save-import',
  chatImportOpen: 'content.chat-import-open',
  characterImport: 'content.character-import',
  characterLoad: 'dlc.character-load',
  packLoad: 'dlc.pack-load',
  artModify: 'content.art-modify',
  behaviorModify: 'content.behavior-modify',
  voiceModify: 'content.voice-modify',
  characterSettingModify: 'content.character-setting-modify',
  ttsEnable: 'tts.enable',
  ttsChange: 'tts.config-change',
  ttsConfirm: 'tts.confirm',
  asrEnable: 'asr.enable',
  asrChange: 'asr.config-change',
  asrConfirm: 'asr.confirm',
  // Roleplay (all-ages, local-template only): every start/change re-prompts the
  // FULL TOS + the separate roleplay declaration and requires a fresh form.
  roleplayStart: 'roleplay.start',
  roleplayChange: 'roleplay.change',
  roleplayConfirm: 'roleplay.confirm',
  roleplayExit: 'roleplay.exit',
  // Age self-report verification (general features stay all-ages; roleplay 18+).
  // The birth date itself is NEVER an audit target/field.
  ageVerify: 'age.verify',
  ageDecline: 'age.decline',
  ageCorrect: 'age.correct',
  // User data controls (P0 R-P0-06): recorded as minimal audit actions, never
  // as content-change consents. These do not alter the canonical TOS text/hash.
  withdraw: 'consent.withdraw',
  deleteAll: 'consent.delete-all',
  auditClear: 'consent.audit-clear',
} as const

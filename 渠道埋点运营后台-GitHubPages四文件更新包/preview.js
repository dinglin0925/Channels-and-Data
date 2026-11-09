;(function () {
  'use strict'

  const requiredGlobals = ['Vue', 'ElementPlus', 'ElementPlusIconsVue', 'SearchForm', 'ListTable', 'LayoutForm']
  const missing = requiredGlobals.filter(name => !window[name])
  if (missing.length) {
    const mount = document.getElementById('app')
    mount.removeAttribute('v-cloak')
    mount.textContent = `页面组件加载失败：${missing.join('、')}。请检查网络后刷新。`
    console.error('[渠道追踪 Demo] 缺少 UMD 组件：', missing)
    return
  }

  const { createApp, ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } = window.Vue
  const message = window.ElementPlus.ElMessage
  const STORAGE_KEY = 'mxchoice-channel-demo-v1'
  const getTemplate = id => document.getElementById(id).textContent
  const clone = value => JSON.parse(JSON.stringify(value))
  const formatNumber = value => Number(value || 0).toLocaleString('zh-CN')
  const rate = (uid, pv) => pv ? `${(uid / pv * 100).toFixed(2)}%` : '—'
  const excelRate = (uid, pv) => pv ? uid / pv : null
  const excelDateSerial = value => {
    const [date, time = '00:00:00'] = String(value).split(' ')
    const [year, month, day] = date.split('-').map(Number)
    const [hour, minute, second] = time.split(':').map(Number)
    return (Date.UTC(year, month - 1, day, hour, minute, second) - Date.UTC(1899, 11, 30)) / 86400000
  }
  const setExcelFormat = (sheet, address, format) => { if (sheet[address]) sheet[address].z = format }
  const normalizeActivityName = name => String(name || '').trim()

  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value)
    const size = Math.ceil((bytes.length + 9) / 64) * 16
    const words = new Uint32Array(size)
    for (let index = 0; index < bytes.length; index++) words[index >>> 2] |= bytes[index] << (24 - (index & 3) * 8)
    words[bytes.length >>> 2] |= 0x80 << (24 - (bytes.length & 3) * 8)
    const bits = bytes.length * 8
    words[size - 2] = Math.floor(bits / 0x100000000)
    words[size - 1] = bits >>> 0
    let state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    const ror = (number, count) => (number >>> count) | (number << (32 - count))
    for (let block = 0; block < size; block += 16) {
      const schedule = new Uint32Array(64)
      schedule.set(words.subarray(block, block + 16))
      for (let index = 16; index < 64; index++) {
        const a = ror(schedule[index - 15], 7) ^ ror(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3)
        const b = ror(schedule[index - 2], 17) ^ ror(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10)
        schedule[index] = (schedule[index - 16] + a + schedule[index - 7] + b) >>> 0
      }
      let [a, b, c, d, e, f, g, h] = state
      for (let index = 0; index < 64; index++) {
        const sum1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)
        const choose = (e & f) ^ (~e & g)
        const first = (h + sum1 + choose + SHA256_K[index] + schedule[index]) >>> 0
        const sum0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)
        const majority = (a & b) ^ (a & c) ^ (b & c)
        const second = (sum0 + majority) >>> 0
        h = g; g = f; f = e; e = (d + first) >>> 0
        d = c; c = b; b = a; a = (first + second) >>> 0
      }
      const next = [a, b, c, d, e, f, g, h]
      state = state.map((number, index) => (number + next[index]) >>> 0)
    }
    return state.map(number => number.toString(16).padStart(8, '0')).join('')
  }

  const makeActivityId = name => {
    const normalized = normalizeActivityName(name)
    return normalized ? `AC-${sha256Hex(normalized).slice(0, 16)}` : ''
  }

  function dateAtOffset(offset) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const [year, month, day] = today.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day + offset))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  }

  const defaultDateRange = () => [dateAtOffset(-6), dateAtOffset(0)]
  const nowInChina = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())

  const sampleChannels = [
    { ai_id: 'CH01', ai_name: 'Choice 终端', ai_sourceCode: 'choice_terminal', ai_active: true, ai_positions: [
      { ai_name: '首页 Banner', ai_code: 'banner', ai_active: true }, { ai_name: '导航图标', ai_code: 'icon_entry', ai_active: true },
    ] },
    { ai_id: 'CH02', ai_name: '微信公众号', ai_sourceCode: 'wechat_oa', ai_active: true, ai_positions: [
      { ai_name: '文章正文', ai_code: 'article', ai_active: true },
    ] },
    { ai_id: 'CH03', ai_name: 'Choice 官网', ai_sourceCode: 'choice_web', ai_active: true, ai_positions: [
      { ai_name: '首页 Banner', ai_code: 'banner', ai_active: true }, { ai_name: '弹窗', ai_code: 'pop_window', ai_active: true },
    ] },
    { ai_id: 'CH04', ai_name: 'Choice APP', ai_sourceCode: 'choice_app', ai_active: true, ai_positions: [
      { ai_name: '消息推送', ai_code: 'push', ai_active: true }, { ai_name: '弹窗', ai_code: 'pop_window', ai_active: true },
    ] },
    { ai_id: 'CH05', ai_name: '东方财富网', ai_sourceCode: 'eastmoney_web', ai_active: true, ai_positions: [
      { ai_name: '首页 Banner', ai_code: 'banner', ai_active: true }, { ai_name: '专题文章', ai_code: 'article', ai_active: true },
    ] },
  ]

  const linkSeeds = [
    { ai_id: 'LK-SAMPLE-01', ai_name: '2026 秋季策略活动', ai_rawUrl: 'https://choice.eastmoney.com/activity?from=homepage', ai_channelId: 'CH01', ai_mediumCode: 'banner', ai_basePv: 2860, ai_rateBasis: 88 },
    { ai_id: 'LK-SAMPLE-02', ai_name: '2026 秋季策略活动', ai_rawUrl: 'https://choice.eastmoney.com/activity?from=wechat', ai_channelId: 'CH02', ai_mediumCode: 'article', ai_basePv: 1740, ai_rateBasis: 80 },
    { ai_id: 'LK-SAMPLE-03', ai_name: '2026 秋季策略活动', ai_rawUrl: 'https://choice.eastmoney.com/product?from=website', ai_channelId: 'CH03', ai_mediumCode: 'banner', ai_basePv: 780, ai_rateBasis: 52 },
    { ai_id: 'LK-SAMPLE-04', ai_name: '2026 秋季策略活动', ai_rawUrl: 'https://choice.eastmoney.com/product?from=app', ai_channelId: 'CH04', ai_mediumCode: 'push', ai_basePv: 1120, ai_rateBasis: 69 },
    { ai_id: 'LK-SAMPLE-05', ai_name: '2026 秋季策略活动', ai_rawUrl: 'https://choice.eastmoney.com/activity?from=eastmoney', ai_channelId: 'CH05', ai_mediumCode: 'article', ai_basePv: 1430, ai_rateBasis: 66 },
    { ai_id: 'LK-SAMPLE-06', ai_name: '2026 产品功能推广', ai_rawUrl: 'https://choice.eastmoney.com/product?feature=research', ai_channelId: 'CH01', ai_mediumCode: 'icon_entry', ai_basePv: 620, ai_rateBasis: 61 },
    { ai_id: 'LK-SAMPLE-07', ai_name: '2026 产品功能推广', ai_rawUrl: 'https://choice.eastmoney.com/product?feature=research&from=app', ai_channelId: 'CH04', ai_mediumCode: 'push', ai_basePv: 880, ai_rateBasis: 57 },
    { ai_id: 'LK-SAMPLE-08', ai_name: '2026 新客专题', ai_rawUrl: 'https://choice.eastmoney.com/activity?topic=new-user', ai_channelId: 'CH02', ai_mediumCode: 'article', ai_basePv: 430, ai_rateBasis: 72 },
  ]

  function dailySeries(basePv, rateBasis, seedIndex) {
    return Array.from({ length: 14 }, (_, index) => {
      const factor = 0.66 + ((index * 17 + seedIndex * 11) % 9) / 20
      const ai_pv = Math.round(basePv * factor)
      return { ai_date: dateAtOffset(index - 13), ai_pv, ai_uid: Math.round(ai_pv * rateBasis / 1000) }
    })
  }

  function createSampleLinks() {
    return linkSeeds.map((seed, index) => {
      const channel = sampleChannels.find(item => item.ai_id === seed.ai_channelId)
      const position = channel.ai_positions.find(item => item.ai_code === seed.ai_mediumCode)
      const url = new URL(seed.ai_rawUrl)
      url.searchParams.set('mxchoice_source', channel.ai_sourceCode)
      url.searchParams.set('mxchoice_medium', position.ai_code)
      return {
        ai_id: seed.ai_id,
        ai_name: seed.ai_name,
        ai_activityId: makeActivityId(seed.ai_name),
        ai_rawUrl: seed.ai_rawUrl,
        ai_url: url.toString(),
        ai_channelId: channel.ai_id,
        ai_channelName: channel.ai_name,
        ai_sourceCode: channel.ai_sourceCode,
        ai_mediumCode: position.ai_code,
        ai_mediumName: position.ai_name,
        ai_createdAt: `${dateAtOffset(-7 + Math.floor(index / 2))} ${String(9 + index % 7).padStart(2, '0')}:30`,
        ai_daily: dailySeries(seed.ai_basePv, seed.ai_rateBasis, index),
        ai_demo: true,
      }
    })
  }

  function createSampleUids() {
    const devices = ['Windows 终端', '微信内浏览器', 'Chrome 桌面端', 'iOS APP', '移动浏览器', 'Mac 终端']
    return linkSeeds.flatMap((seed, index) => Array.from({ length: 2 + index % 2 }, (_, sample) => ({
      ai_uid: `UID_${String(910000 + index * 97 + sample * 13)}`,
      ai_linkId: seed.ai_id,
      ai_convertedAt: `${dateAtOffset(-((index + sample) % 6))} ${String(10 + (index + sample) % 10).padStart(2, '0')}:${String(12 + index * 3 + sample * 7).padStart(2, '0')}:08`,
      ai_device: devices[(index + sample) % devices.length],
    })))
  }

  const sampleUids = createSampleUids()

  const required = text => [{ required: true, message: text, trigger: 'blur' }]
  const historyTableList = [
    { prop: 'ai_name', label: '链接名称 / 活动 ID', minWidth: 220, slot: true },
    { prop: 'ai_channelName', label: '投放渠道', minWidth: 128 },
    { prop: 'ai_mediumName', label: '投放位置', minWidth: 115 },
    { prop: 'ai_createdAt', label: '创建时间', minWidth: 152 },
  ]
  const channelTableList = [
    { prop: 'ai_name', label: '投放渠道', minWidth: 132 },
    { prop: 'ai_sourceCode', label: 'mxchoice_source', minWidth: 152, slot: true },
    { prop: 'ai_mediumText', label: 'mxchoice_medium', minWidth: 238, slot: true },
    { prop: 'ai_activeText', label: '应用状态', minWidth: 92, slot: true },
  ]
  const channelReportTableList = [
    { prop: 'ai_channelName', label: '投放渠道', minWidth: 132 },
    { prop: 'ai_sourceCode', label: 'mxchoice_source', minWidth: 154, slot: true },
    { prop: 'ai_linkCount', label: '链接数', minWidth: 82, align: 'right' },
    { prop: 'ai_pv', label: '访问量 PV', minWidth: 116, align: 'right', slot: true },
    { prop: 'ai_uid', label: '转化 UID', minWidth: 116, align: 'right', slot: true },
    { prop: 'ai_rate', label: '转化率', minWidth: 100, align: 'right' },
  ]
  const linkReportTableList = [
    { prop: 'ai_name', label: '链接名称 / 活动 ID', minWidth: 210, slot: true },
    { prop: 'ai_channelName', label: '投放渠道', minWidth: 120 },
    { prop: 'ai_mediumName', label: '投放位置', minWidth: 110 },
    { prop: 'ai_pv', label: '访问量 PV', minWidth: 112, align: 'right', slot: true },
    { prop: 'ai_uid', label: '转化 UID', minWidth: 112, align: 'right', slot: true },
    { prop: 'ai_rate', label: '转化率', minWidth: 96, align: 'right' },
  ]
  const uidTableList = [
    { prop: 'ai_uid', label: 'UID', minWidth: 165 },
    { prop: 'ai_convertedAt', label: '转化时间', minWidth: 165 },
    { prop: 'ai_device', label: '设备 / 来源', minWidth: 160 },
  ]

  function createFormList(channels, model) {
    const enabled = channels.filter(channel => channel.ai_active && channel.ai_positions.some(position => position.ai_active))
    const selected = enabled.find(channel => channel.ai_id === model.ai_channelId)
    const positions = selected?.ai_positions.filter(position => position.ai_active) || []
    return [
      { cols: [
        { prop: 'ai_rawUrl', label: '原始网址', type: 'el-input', col: 24, width: '100%', placeholder: '粘贴完整网址，如 https://example.com/activity', clearable: true, rules: required('请填写原始网址') },
        { prop: 'ai_name', label: '链接名称', type: 'el-input', col: 24, width: '100%', placeholder: '例如：2026 秋季策略活动', maxlength: 80, clearable: true, notTrim: true, rules: required('请填写链接名称') },
        { prop: 'ai_activityId', label: '活动 ID', type: 'slot', col: 24, width: '100%', rules: required('请先填写链接名称') },
      ] },
      { cols: [
        { prop: 'ai_channelId', label: '投放渠道', type: 'el-select', col: 12, width: '100%', placeholder: '选择渠道', options: enabled.map(channel => ({ value: channel.ai_id, label: channel.ai_name })), rules: required('请选择投放渠道') },
        { prop: 'ai_mediumCode', label: '投放位置', type: 'el-select', col: 12, width: '100%', placeholder: '选择位置', options: positions.map(position => ({ value: position.ai_code, label: `${position.ai_name} · ${position.ai_code}` })), rules: required('请选择投放位置') },
      ] },
    ]
  }

  function historySearchList(channels) {
    return [
      { prop: 'ai_keyword', label: '关键词', type: 'el-input', placeholder: '链接名称、活动 ID 或网址', width: '260px', clearable: true, notTrim: true, enterKeyEvent: true },
      { prop: 'ai_channelId', label: '渠道', type: 'el-select', placeholder: '全部渠道', width: '180px', clearable: true, options: channels.map(channel => ({ value: channel.ai_id, label: channel.ai_name })) },
    ]
  }

  function reportSearchList(activityNames) {
    const activities = activityNames.map(name => ({ value: name, label: name }))
    return [
      { prop: 'ai_scope', label: '查询范围', type: 'el-select', width: '150px', options: [
        { value: 'all', label: '全部活动' }, { value: 'single', label: '单个活动' }, { value: 'multi', label: '多个活动' },
      ] },
      { prop: 'ai_activityName', label: '链接名称', type: 'el-select', width: '250px', filterable: true, clearable: true, placeholder: '选择一个活动', options: activities, isShowFunc: model => model.ai_scope === 'single' },
      { prop: 'ai_activityNames', label: '链接名称', type: 'el-select', width: '300px', filterable: true, clearable: true, multiple: true, placeholder: '选择多个活动', options: activities, isShowFunc: model => model.ai_scope === 'multi' },
      { prop: 'ai_dateRange', label: '日期', type: 'el-date-picker', dataType: 'daterange', valueFormat: 'YYYY-MM-DD', width: '300px', clearable: false },
    ]
  }

  function buildTrackingUrl(raw, source, medium) {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('请输入完整有效的 HTTP 或 HTTPS 网址')
    for (const key of ['utm_source', 'utm_medium', 'mxchoice_source', 'mxchoice_medium', 'mxchoice_activity_id', 'cl_id']) {
      url.searchParams.delete(key)
    }
    url.searchParams.set('mxchoice_source', source)
    url.searchParams.set('mxchoice_medium', medium)
    return url.toString()
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const field = document.createElement('textarea')
      field.value = value
      field.style.position = 'fixed'
      field.style.left = '-9999px'
      document.body.appendChild(field)
      field.select()
      const copied = document.execCommand('copy')
      field.remove()
      if (!copied) throw new Error('当前浏览器不支持自动复制')
    }
    message.success('链接已复制')
  }

  const ChannelDialog = {
    name: 'ChannelDialog',
    template: getTemplate('channel-dialog-template'),
    props: { visible: Boolean, channel: Object, channels: { type: Array, default: () => [] }, links: { type: Array, default: () => [] } },
    emits: ['update:visible', 'confirm', 'close'],
    setup(props, { emit }) {
      const formRef = ref(null)
      const saving = ref(false)
      const blank = () => ({ ai_id: '', ai_name: '', ai_sourceCode: '', ai_positions: [{ ai_name: '', ai_code: '', ai_active: true }], ai_active: true })
      const draft = ref(blank())
      const innerVisible = computed({ get: () => props.visible, set: value => emit('update:visible', value) })
      const channelLinks = computed(() => props.channel
        ? props.links.filter(link => link.ai_channelId === props.channel.ai_id || (!link.ai_channelId && link.ai_sourceCode === props.channel.ai_sourceCode))
        : [])
      const channelUsed = computed(() => channelLinks.value.length > 0)
      const usedPositionCodes = computed(() => new Set(channelLinks.value.map(link => link.ai_mediumCode)))
      const positionUsed = code => usedPositionCodes.value.has(code)
      const formItems = [
        { cols: [
          { prop: 'ai_name', label: '渠道名称', type: 'el-input', col: 24, width: '100%', placeholder: '例如：视频号', clearable: true, maxlength: 40, notTrim: true, rules: required('请填写渠道名称') },
          { prop: 'ai_sourceCode', label: '来源代码', type: 'el-input', col: 24, width: '100%', placeholder: '例如 video_account', clearable: true, maxlength: 40, disabledFunc: () => channelUsed.value, rules: required('请填写来源代码') },
        ] },
      ]
      watch(() => props.visible, opened => { if (opened) draft.value = props.channel ? clone(props.channel) : blank() })
      const addPosition = () => draft.value.ai_positions.push({ ai_name: '', ai_code: '', ai_active: true })
      const removePosition = index => {
        if (positionUsed(draft.value.ai_positions[index]?.ai_code || '')) return message.warning('已有链接使用该位置代码，不能删除；可将位置停用')
        draft.value.ai_positions.splice(index, 1)
        if (!draft.value.ai_positions.length) addPosition()
      }
      const resetDialog = () => { draft.value = blank(); formRef.value?.clearValidate?.(); emit('close') }
      async function confirm() {
        saving.value = true
        try {
          const valid = await formRef.value?.submit?.().catch(() => false)
          if (!valid) return
          const current = draft.value
          current.ai_name = current.ai_name.trim()
          current.ai_sourceCode = current.ai_sourceCode.trim()
          if (!/^[a-z][a-z0-9_]*$/.test(current.ai_sourceCode)) return message.warning('来源代码须以小写字母开头，只含小写字母、数字和下划线')
          if (props.channels.some(item => item.ai_id !== current.ai_id && (item.ai_name === current.ai_name || item.ai_sourceCode === current.ai_sourceCode))) {
            return message.warning('渠道名称或来源代码已存在')
          }
          if (!current.ai_positions.length) return message.warning('请配置至少一个投放位置')
          for (const position of current.ai_positions) {
            position.ai_name = position.ai_name.trim()
            position.ai_code = position.ai_code.trim()
            if (!position.ai_name || !/^[a-z][a-z0-9_]*$/.test(position.ai_code)) {
              return message.warning('请填写位置名称；位置代码须以小写字母开头，只含小写字母、数字和下划线')
            }
          }
          const codes = current.ai_positions.map(position => position.ai_code)
          const names = current.ai_positions.map(position => position.ai_name)
          if (new Set(codes).size !== codes.length || new Set(names).size !== names.length) return message.warning('同一渠道的位置名称和代码不能重复')
          if (props.channel && channelUsed.value) {
            if (current.ai_sourceCode !== props.channel.ai_sourceCode) return message.warning('已有链接使用该来源代码，不能修改')
            if ([...usedPositionCodes.value].some(code => !codes.includes(code))) return message.warning('已有链接使用的位置代码不能修改或删除；可将位置停用')
          }
          if (current.ai_active && !current.ai_positions.some(position => position.ai_active)) return message.warning('启用的渠道至少需要一个启用位置')
          emit('confirm', clone(current))
          innerVisible.value = false
        } finally { saving.value = false }
      }
      return { formRef, saving, draft, innerVisible, formItems, channelUsed, positionUsed, addPosition, removePosition, resetDialog, confirm }
    },
  }

  const LinkDetailDialog = {
    name: 'LinkDetailDialog',
    template: getTemplate('link-detail-dialog-template'),
    props: { visible: Boolean, link: Object },
    emits: ['update:visible', 'close'],
    setup(props, { emit }) {
      const innerVisible = computed({ get: () => props.visible, set: value => emit('update:visible', value) })
      const copyCurrent = () => props.link && copyText(props.link.ai_url).catch(error => message.error(error.message))
      return { innerVisible, copyCurrent }
    },
  }

  const App = {
    name: 'ChannelTrackingDemo',
    template: getTemplate('app-template'),
    components: { ChannelDialog, LinkDetailDialog },
    setup() {
      const activePage = ref(location.hash === '#data' ? 'data' : 'links')
      const channels = ref(clone(sampleChannels))
      const links = ref(createSampleLinks())
      const createFormRef = ref(null)
      const createModel = ref({ ai_rawUrl: '', ai_name: '', ai_activityId: '', ai_channelId: 'CH01', ai_mediumCode: 'banner' })
      const generating = ref(false)
      const lastGenerated = ref(null)
      const channelDialogVisible = ref(false)
      const editingChannel = ref(null)
      const detailDialogVisible = ref(false)
      const selectedLink = ref(null)
      const configLoading = ref(false)
      const historyLoading = ref(false)
      const reportLoading = ref(false)
      const historySearch = ref({ ai_keyword: '', ai_channelId: '' })
      const historyApplied = ref({ ai_keyword: '', ai_channelId: '' })
      const historyPage = reactive({ pageNum: 1, pageSize: 5, total: 0 })
      const reportSearch = ref({ ai_scope: 'all', ai_activityName: '', ai_activityNames: [], ai_dateRange: defaultDateRange() })
      const reportApplied = ref(clone(reportSearch.value))
      const reportView = ref('channel')
      const ai_channelKeyword = ref('')
      const uidLinkId = ref('LK-SAMPLE-01')
      const uidUrlQuery = ref('')
      const uidKeyword = ref('')

      // LayoutForm emits a new model object whenever formList changes. Keep the
      // form list keyed to the selected channel so that emission cannot loop.
      const selectedChannelId = computed(() => createModel.value.ai_channelId)
      const createFormItems = computed(() => createFormList(channels.value, { ai_channelId: selectedChannelId.value }))
      const historySearchItems = computed(() => historySearchList(channels.value))
      const activityNames = computed(() => [...new Set(links.value.map(link => link.ai_name))])
      const reportSearchItems = computed(() => reportSearchList(activityNames.value))
      const channelRows = computed(() => channels.value.map(channel => ({
        ...channel,
        ai_mediumText: channel.ai_positions.map(position => position.ai_code).join(', '),
        ai_activeText: channel.ai_active ? '启用' : '停用',
      })))
      const channelTableOption = { index: false, hasPagination: false, operateWidth: 80, operateFixed: 'right', maxHeight: 360 }
      const historyTableOption = { index: false, hasPagination: true, operateWidth: 122, operateFixed: 'right', maxHeight: 410 }
      const reportTableOption = { index: false, hasPagination: false, maxHeight: 430 }
      const uidTableOption = { index: false, hasPagination: false, maxHeight: 330 }

      const historyFiltered = computed(() => {
        const keyword = historyApplied.value.ai_keyword.trim().toLowerCase()
        const channelId = historyApplied.value.ai_channelId
        return links.value.filter(link =>
          (!channelId || link.ai_channelId === channelId) &&
          (!keyword || [link.ai_name, link.ai_activityId, link.ai_url, link.ai_rawUrl, link.ai_id].some(value => String(value).toLowerCase().includes(keyword))),
        )
      })
      const historyVisible = computed(() => historyFiltered.value.slice(
        (historyPage.pageNum - 1) * historyPage.pageSize,
        historyPage.pageNum * historyPage.pageSize,
      ))

      const selectedActivityNames = computed(() => {
        if (reportApplied.value.ai_scope === 'single') return reportApplied.value.ai_activityName ? [reportApplied.value.ai_activityName] : []
        if (reportApplied.value.ai_scope === 'multi') return reportApplied.value.ai_activityNames
        return activityNames.value
      })
      const reportScopeSummary = computed(() => {
        const query = reportApplied.value
        if (query.ai_scope === 'all') return `全部活动 · ${activityNames.value.length} 个`
        if (query.ai_scope === 'single') return query.ai_activityName || '未选择活动'
        return `已选 ${query.ai_activityNames.length} 个活动：${query.ai_activityNames.join('、')}`
      })
      const reportSelectionValid = computed(() => {
        const query = reportSearch.value
        if (query.ai_scope === 'single') return !!query.ai_activityName
        if (query.ai_scope === 'multi') return query.ai_activityNames.length > 0
        return true
      })
      const linkReportRows = computed(() => {
        const selected = new Set(selectedActivityNames.value)
        const [start, end] = reportApplied.value.ai_dateRange
        return links.value.filter(link => selected.has(link.ai_name)).map(link => {
          const totals = (link.ai_daily || []).filter(day => day.ai_date >= start && day.ai_date <= end)
            .reduce((acc, day) => ({ ai_pv: acc.ai_pv + day.ai_pv, ai_uid: acc.ai_uid + day.ai_uid }), { ai_pv: 0, ai_uid: 0 })
          return { ...link, ...totals, ai_rate: rate(totals.ai_uid, totals.ai_pv) }
        })
      })
      const reportTotal = computed(() => {
        const ai_pv = linkReportRows.value.reduce((sum, link) => sum + link.ai_pv, 0)
        const ai_uid = linkReportRows.value.reduce((sum, link) => sum + link.ai_uid, 0)
        return { ai_pv, ai_uid, ai_rate: rate(ai_uid, ai_pv), ai_linkCount: linkReportRows.value.length }
      })
      const channelReportRows = computed(() => {
        const grouped = new Map()
        for (const link of linkReportRows.value) {
          const existing = grouped.get(link.ai_sourceCode) || {
            ai_channelName: link.ai_channelName, ai_sourceCode: link.ai_sourceCode,
            ai_linkCount: 0, ai_pv: 0, ai_uid: 0, ai_rate: '—', ai_share: 0,
          }
          existing.ai_linkCount += 1
          existing.ai_pv += link.ai_pv
          existing.ai_uid += link.ai_uid
          grouped.set(link.ai_sourceCode, existing)
        }
        return [...grouped.values()].map(row => ({
          ...row,
          ai_rate: rate(row.ai_uid, row.ai_pv),
          ai_share: reportTotal.value.ai_pv ? Math.round(row.ai_pv / reportTotal.value.ai_pv * 100) : 0,
        })).sort((a, b) => b.ai_pv - a.ai_pv)
      })
      const matchesReportChannel = row => {
        const keyword = ai_channelKeyword.value.trim().toLowerCase()
        return !keyword || [row.ai_channelName, row.ai_sourceCode].some(value => String(value).toLowerCase().includes(keyword))
      }
      const visibleChannelReportRows = computed(() => channelReportRows.value.filter(matchesReportChannel))
      const visibleLinkReportRows = computed(() => linkReportRows.value.filter(matchesReportChannel))
      const selectedUidLink = computed(() => linkReportRows.value.find(link => link.ai_id === uidLinkId.value) || null)
      const uidRows = computed(() => {
        const [start, end] = reportApplied.value.ai_dateRange
        const keyword = uidKeyword.value.trim().toLowerCase()
        return sampleUids.filter(row => row.ai_linkId === uidLinkId.value && row.ai_convertedAt.slice(0, 10) >= start && row.ai_convertedAt.slice(0, 10) <= end)
          .filter(row => !keyword || [row.ai_uid, row.ai_device].some(value => value.toLowerCase().includes(keyword)))
      })

      watch(() => createModel.value.ai_name, name => {
        const normalized = normalizeActivityName(name)
        const existing = links.value.find(link => normalizeActivityName(link.ai_name) === normalized)
        createModel.value.ai_activityId = normalized ? (existing?.ai_activityId || makeActivityId(normalized)) : ''
      })

      function persistState() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ai_channels: channels.value,
            ai_customLinks: links.value.filter(link => !link.ai_demo),
          }))
          return true
        } catch {
          message.warning('浏览器存储不可用，本次修改仅在当前页面保留')
          return false
        }
      }

      function loadState() {
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
          if (Array.isArray(saved?.ai_channels) && saved.ai_channels.length) channels.value = saved.ai_channels
          if (Array.isArray(saved?.ai_customLinks)) links.value = [...saved.ai_customLinks, ...createSampleLinks()]
        } catch {
          channels.value = clone(sampleChannels)
          links.value = createSampleLinks()
        }
      }

      function ensureCreateSelection() {
        const enabled = channels.value.filter(channel => channel.ai_active && channel.ai_positions.some(position => position.ai_active))
        let selected = enabled.find(channel => channel.ai_id === createModel.value.ai_channelId)
        if (!selected) selected = enabled[0]
        createModel.value.ai_channelId = selected?.ai_id || ''
        const positions = selected?.ai_positions.filter(position => position.ai_active) || []
        if (!positions.some(position => position.ai_code === createModel.value.ai_mediumCode)) createModel.value.ai_mediumCode = positions[0]?.ai_code || ''
      }

      function switchPage(page) {
        activePage.value = page
        if (location.hash !== `#${page}`) location.hash = page
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      function onHashChange() { activePage.value = location.hash === '#data' ? 'data' : 'links' }
      function scrollToConfig() { nextTick(() => document.getElementById('channel-config')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
      function onCreateChange(value, item) {
        if (item?.prop !== 'ai_channelId') return
        const channel = channels.value.find(candidate => candidate.ai_id === value)
        createModel.value.ai_mediumCode = channel?.ai_positions.find(position => position.ai_active)?.ai_code || ''
      }

      async function generateLink() {
        const name = normalizeActivityName(createModel.value.ai_name)
        if (!name) return message.warning('请填写链接名称')
        createModel.value.ai_name = name
        createModel.value.ai_activityId = links.value.find(link => normalizeActivityName(link.ai_name) === name)?.ai_activityId || makeActivityId(name)
        generating.value = true
        try {
          const valid = await createFormRef.value?.submit?.().catch(() => false)
          if (!valid) return
          const channel = channels.value.find(item => item.ai_id === createModel.value.ai_channelId && item.ai_active)
          const position = channel?.ai_positions.find(item => item.ai_code === createModel.value.ai_mediumCode && item.ai_active)
          if (!channel || !position) return message.warning('请选择启用的投放渠道和位置')
          let url
          try { url = buildTrackingUrl(createModel.value.ai_rawUrl.trim(), channel.ai_sourceCode, position.ai_code) }
          catch (error) { return message.warning(error.message) }
          const existing = links.value.find(link => link.ai_url === url)
          if (existing) {
            if (existing.ai_name !== name) return message.warning(`这个链接已用于「${existing.ai_name}」，请更换原网址或投放位置`)
            lastGenerated.value = existing
            return message.info('相同活动和参数的链接已存在，已展示历史记录')
          }
          const created = {
            ai_id: `LK-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            ai_name: name,
            ai_activityId: createModel.value.ai_activityId,
            ai_rawUrl: createModel.value.ai_rawUrl.trim(),
            ai_url: url,
            ai_channelId: channel.ai_id,
            ai_channelName: channel.ai_name,
            ai_sourceCode: channel.ai_sourceCode,
            ai_mediumCode: position.ai_code,
            ai_mediumName: position.ai_name,
            ai_createdAt: nowInChina(),
            ai_daily: [],
            ai_demo: false,
          }
          links.value.unshift(created)
          lastGenerated.value = created
          persistState()
          applyHistorySearch()
          message.success('埋点链接已生成，并加入历史记录')
        } finally { generating.value = false }
      }

      function copyLink(url) { copyText(url).catch(error => message.error(error.message)) }
      function openLink(url) {
        try {
          const target = new URL(url)
          if (!['http:', 'https:'].includes(target.protocol)) throw new Error()
          window.open(target.toString(), '_blank', 'noopener,noreferrer')
        } catch { message.warning('链接格式无效，无法打开') }
      }
      function openChannelDialog(channel) { editingChannel.value = channel ? clone(channel) : null; channelDialogVisible.value = true }
      function closeChannelDialog() { editingChannel.value = null }
      function saveChannel(channel) {
        configLoading.value = true
        if (channel.ai_id) channels.value = channels.value.map(item => item.ai_id === channel.ai_id ? channel : item)
        else channels.value.push({ ...channel, ai_id: `CH-${Date.now().toString(36).toUpperCase()}` })
        ensureCreateSelection()
        persistState()
        configLoading.value = false
        message.success('渠道与位置配置已保存')
      }
      function openLinkDetail(link) { selectedLink.value = link; detailDialogVisible.value = true }
      function closeLinkDetail() { selectedLink.value = null }
      function applyHistorySearch() {
        historyLoading.value = true
        historyApplied.value = clone(historySearch.value)
        historyPage.pageNum = 1
        nextTick(() => { historyPage.total = historyFiltered.value.length; historyLoading.value = false })
      }
      function resetHistorySearch() {
        historySearch.value = { ai_keyword: '', ai_channelId: '' }
        applyHistorySearch()
      }
      function onHistoryPageChange(page) { historyPage.pageNum = page }
      function onHistorySizeChange(size) { historyPage.pageSize = size; historyPage.pageNum = 1 }

      function onReportChange(value, item) {
        if (item?.prop === 'ai_scope') {
          reportSearch.value.ai_activityName = ''
          reportSearch.value.ai_activityNames = []
        }
      }
      function ensureUidSelection() {
        if (!linkReportRows.value.some(link => link.ai_id === uidLinkId.value)) uidLinkId.value = linkReportRows.value[0]?.ai_id || ''
      }
      function applyReportSearch() {
        const query = reportSearch.value
        if (query.ai_scope === 'single' && !query.ai_activityName) return message.warning('请选择一个链接名称')
        if (query.ai_scope === 'multi' && !query.ai_activityNames.length) return message.warning('请至少选择一个链接名称')
        if (!Array.isArray(query.ai_dateRange) || query.ai_dateRange.length !== 2) return message.warning('请选择完整日期范围')
        reportLoading.value = true
        reportApplied.value = clone(query)
        ensureUidSelection()
        nextTick(() => { reportLoading.value = false })
      }
      function resetReportSearch() {
        reportSearch.value = { ai_scope: 'all', ai_activityName: '', ai_activityNames: [], ai_dateRange: defaultDateRange() }
        applyReportSearch()
      }
      function lookupUidUrl() {
        const query = uidUrlQuery.value.trim()
        if (!query) return message.warning('请粘贴完整埋点链接')
        const matched = linkReportRows.value.find(link => link.ai_url === query)
        if (!matched) return message.warning('当前查询范围内未找到这条链接，请检查活动和日期筛选')
        uidLinkId.value = matched.ai_id
        uidKeyword.value = ''
        message.success('已定位到对应推广链接')
      }
      function exportExcel() {
        if (!reportSelectionValid.value) return message.warning('请先选择链接名称，再导出 Excel')
        if (!window.XLSX) return message.error('Excel 导出组件未加载，请联网后刷新页面')
        const workbook = window.XLSX.utils.book_new()
        const overview = [
          ['渠道追踪演示数据（虚构样例）'],
          ['查询范围', reportScopeSummary.value],
          ['开始日期', excelDateSerial(reportApplied.value.ai_dateRange[0])],
          ['结束日期', excelDateSerial(reportApplied.value.ai_dateRange[1])],
          ['访问量 PV', reportTotal.value.ai_pv],
          ['转化 UID', reportTotal.value.ai_uid],
          ['转化率', excelRate(reportTotal.value.ai_uid, reportTotal.value.ai_pv)],
          ['渠道筛选', ai_channelKeyword.value.trim() || '全部渠道'],
          ['投放渠道', 'mxchoice_source', '链接数', '访问量 PV', '转化 UID', '转化率'],
          ...visibleChannelReportRows.value.map(row => [row.ai_channelName, row.ai_sourceCode, row.ai_linkCount, row.ai_pv, row.ai_uid, excelRate(row.ai_uid, row.ai_pv)]),
        ]
        const detail = [
          ['链接 ID', '链接名称', '活动 ID', '投放渠道', 'mxchoice_source', 'mxchoice_medium', '访问量 PV', '转化 UID', '转化率', '完整链接'],
          ...visibleLinkReportRows.value.map(row => [row.ai_id, row.ai_name, row.ai_activityId, row.ai_channelName, row.ai_sourceCode, row.ai_mediumCode, row.ai_pv, row.ai_uid, excelRate(row.ai_uid, row.ai_pv), row.ai_url]),
        ]
        const overviewSheet = window.XLSX.utils.aoa_to_sheet(overview)
        const detailSheet = window.XLSX.utils.aoa_to_sheet(detail)
        for (const address of ['B3', 'B4']) setExcelFormat(overviewSheet, address, 'yyyy-mm-dd')
        setExcelFormat(overviewSheet, 'B7', '0.00%')
        visibleChannelReportRows.value.forEach((_, index) => setExcelFormat(overviewSheet, `F${index + 10}`, '0.00%'))
        visibleLinkReportRows.value.forEach((_, index) => setExcelFormat(detailSheet, `I${index + 2}`, '0.00%'))
        window.XLSX.utils.book_append_sheet(workbook, overviewSheet, '渠道汇总')
        window.XLSX.utils.book_append_sheet(workbook, detailSheet, '链接明细')
        window.XLSX.writeFile(workbook, `渠道追踪演示数据_${dateAtOffset(0)}.xlsx`)
        message.success('Excel 已导出')
      }
      function exportUidExcel() {
        if (!window.XLSX) return message.error('Excel 导出组件未加载，请联网后刷新页面')
        if (!selectedUidLink.value || !uidRows.value.length) return message.warning('当前链接没有可导出的 UID 示例记录')
        const workbook = window.XLSX.utils.book_new()
        const rows = [
          ['单链接 UID 查询（虚构样例）'],
          ['链接名称', selectedUidLink.value.ai_name],
          ['活动 ID', selectedUidLink.value.ai_activityId],
          ['链接 ID', selectedUidLink.value.ai_id],
          ['日期范围', reportApplied.value.ai_dateRange.join(' 至 ')],
          [],
          ['UID', '转化时间', '设备 / 来源'],
          ...uidRows.value.map(row => [row.ai_uid, excelDateSerial(row.ai_convertedAt), row.ai_device]),
        ]
        const uidSheet = window.XLSX.utils.aoa_to_sheet(rows)
        uidRows.value.forEach((_, index) => { uidSheet[`B${index + 8}`].z = 'yyyy-mm-dd hh:mm:ss' })
        window.XLSX.utils.book_append_sheet(workbook, uidSheet, 'UID 示例明细')
        window.XLSX.writeFile(workbook, `UID演示明细_${selectedUidLink.value.ai_id}_${dateAtOffset(0)}.xlsx`)
        message.success('UID Excel 已导出')
      }

      onMounted(() => {
        loadState()
        ensureCreateSelection()
        applyHistorySearch()
        applyReportSearch()
        onHashChange()
        window.addEventListener('hashchange', onHashChange)
      })
      onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

      return {
        activePage, channels, links, createFormRef, createModel, createFormItems, generating, lastGenerated,
        channelDialogVisible, editingChannel, detailDialogVisible, selectedLink, configLoading,
        historyLoading, historySearch, historySearchItems, historyPage, historyVisible,
        reportLoading, reportSearch, reportSearchItems, reportApplied, reportScopeSummary, reportSelectionValid, reportView, ai_channelKeyword,
        uidLinkId, uidUrlQuery, uidKeyword, selectedUidLink, uidRows,
        channelRows, channelReportRows, linkReportRows, visibleChannelReportRows, visibleLinkReportRows, reportTotal,
        channelTableList, historyTableList, channelReportTableList, linkReportTableList, uidTableList,
        channelTableOption, historyTableOption, reportTableOption, uidTableOption, formatNumber,
        switchPage, scrollToConfig, onCreateChange, generateLink, copyLink, openLink,
        openChannelDialog, closeChannelDialog, saveChannel, openLinkDetail, closeLinkDetail,
        applyHistorySearch, resetHistorySearch, onHistoryPageChange, onHistorySizeChange,
        onReportChange, applyReportSearch, resetReportSearch, lookupUidUrl, exportExcel, exportUidExcel,
      }
    },
  }

  console.info('[渠道追踪 Demo] 图标检查', {
    icons: !!window.ElementPlusIconsVue,
    alias: !!window['@element-plus/icons-vue'],
    Search: !!window.ElementPlusIconsVue?.Search,
    Refresh: !!window.ElementPlusIconsVue?.Refresh,
  })

  const app = createApp(App)
  app.config.errorHandler = (error, instance, info) => console.error('[渠道追踪 Demo] Vue 错误', info, error)
  app.use(window.ElementPlus)
  for (const [name, component] of Object.entries(window.ElementPlusIconsVue)) app.component(name, component)
  app.component('SearchForm', window.SearchForm.SearchForm || window.SearchForm)
  app.component('ListTable', window.ListTable.ListTable || window.ListTable)
  app.component('LayoutForm', window.LayoutForm.LayoutForm || window.LayoutForm)
  app.mount('#app')
})()

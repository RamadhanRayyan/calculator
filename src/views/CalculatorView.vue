<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

// --- State Management ---
type CalcMode = 'standard' | 'scientific' | 'converter'
type ThemePreset = 'cyber' | 'emerald' | 'light'

const mode = ref<CalcMode>('standard')
const theme = ref<ThemePreset>('cyber')
const soundEnabled = ref<boolean>(true)
const isDeg = ref<boolean>(true) // True = Degree, False = Radian

// Calculator Memory & Display
const displayExpression = ref<string>('')
const currentInput = ref<string>('0')
const lastAnswer = ref<string>('')
const isEvaluated = ref<boolean>(false)
const activeKey = ref<string | null>(null)
const toastMessage = ref<string>('')
const showHistory = ref<boolean>(false)

// Converter State
const converterCategory = ref<'length' | 'weight' | 'temp' | 'discount'>('length')
const convertValue = ref<number>(1)
const convertFrom = ref<string>('m')
const convertTo = ref<string>('km')
const discountPrice = ref<number>(100000)
const discountPercent = ref<number>(20)
const discountTax = ref<number>(11)

// History Log
interface HistoryItem {
  id: string
  expression: string
  result: string
  timestamp: string
}

const history = ref<HistoryItem[]>([])

// Load saved history & preferences on mount
onMounted(() => {
  try {
    const savedHistory = localStorage.getItem('nusa_calc_history')
    if (savedHistory) {
      history.value = JSON.parse(savedHistory)
    }
    const savedTheme = localStorage.getItem('nusa_calc_theme') as ThemePreset
    if (savedTheme) {
      theme.value = savedTheme
    }
  } catch (e) {
    console.error('Failed loading saved state', e)
  }

  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// Save history changes
watch(history, (newVal) => {
  try {
    localStorage.setItem('nusa_calc_history', JSON.stringify(newVal.slice(0, 50)))
  } catch (e) {
    console.error('Failed saving history', e)
  }
}, { deep: true })

watch(theme, (newVal) => {
  localStorage.setItem('nusa_calc_theme', newVal)
})

// --- Sound Effects using Web Audio API ---
let audioCtx: AudioContext | null = null

const playSound = (freq = 600, type: OscillatorType = 'sine', duration = 0.04) => {
  if (!soundEnabled.value) return
  try {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new AudioCtx()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime)
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + duration)
  } catch (e) {
    // Ignore audio context errors
  }
}

// --- Toast Notification ---
const showToast = (msg: string) => {
  toastMessage.value = msg
  setTimeout(() => {
    if (toastMessage.value === msg) {
      toastMessage.value = ''
    }
  }, 2200)
}

// --- Formatting Helpers ---
const formatDisplayNumber = (val: string) => {
  if (!val || val === 'Error' || val === 'Infinity' || val.includes('bukan angka') || val.includes('Sintaks Error') || val.includes('Tidak bisa')) return val
  if (val.includes('e') || val.includes('E')) return val
  
  const parts = val.split('.')
  const integerPart = (parts[0] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.length > 1 ? `${integerPart},${parts[1]}` : integerPart
}

// --- Mathematical Engine & Functions ---
const appendNumber = (num: string) => {
  playSound(700, 'sine')
  triggerKeyHighlight(num)
  
  if (isEvaluated.value) {
    currentInput.value = num
    displayExpression.value = ''
    isEvaluated.value = false
    return
  }

  if (currentInput.value === '0') {
    currentInput.value = num
  } else {
    currentInput.value += num
  }
}

const appendDecimal = () => {
  playSound(750, 'sine')
  triggerKeyHighlight('.')

  if (isEvaluated.value) {
    currentInput.value = '0.'
    displayExpression.value = ''
    isEvaluated.value = false
    return
  }

  if (!currentInput.value.includes('.')) {
    currentInput.value += '.'
  }
}

const appendOperator = (op: string) => {
  playSound(520, 'triangle')
  triggerKeyHighlight(op)

  if (isEvaluated.value) {
    isEvaluated.value = false
  }

  const displayOp = ` ${op} `
  displayExpression.value += `${currentInput.value}${displayOp}`
  currentInput.value = '0'
}

const appendFunction = (fn: string) => {
  playSound(580, 'triangle')
  triggerKeyHighlight(fn)

  if (isEvaluated.value) {
    isEvaluated.value = false
  }

  if (fn === 'π') {
    currentInput.value = Math.PI.toString()
  } else if (fn === 'e') {
    currentInput.value = Math.E.toString()
  } else if (fn === 'x²') {
    const val = parseFloat(currentInput.value) || 0
    currentInput.value = (val * val).toString()
  } else if (fn === '1/x') {
    const val = parseFloat(currentInput.value)
    if (val === 0) {
      currentInput.value = 'Tidak bisa dibagi 0'
    } else {
      currentInput.value = (1 / val).toString()
    }
  } else if (fn === '√') {
    displayExpression.value += `√(${currentInput.value})`
    const val = parseFloat(currentInput.value) || 0
    currentInput.value = val < 0 ? 'Error' : Math.sqrt(val).toString()
    isEvaluated.value = true
  } else if (['sin', 'cos', 'tan', 'log', 'ln'].includes(fn)) {
    displayExpression.value += `${fn}(${currentInput.value}) `
    const num = parseFloat(currentInput.value) || 0
    let res = 0
    if (fn === 'sin') {
      const rad = isDeg.value ? (num * Math.PI) / 180 : num
      res = Math.sin(rad)
    } else if (fn === 'cos') {
      const rad = isDeg.value ? (num * Math.PI) / 180 : num
      res = Math.cos(rad)
    } else if (fn === 'tan') {
      const rad = isDeg.value ? (num * Math.PI) / 180 : num
      res = Math.tan(rad)
    } else if (fn === 'log') {
      res = Math.log10(num)
    } else if (fn === 'ln') {
      res = Math.log(num)
    }
    // Round small floats e.g. sin(180) -> 0
    res = Number(res.toFixed(10))
    currentInput.value = res.toString()
    isEvaluated.value = true
  } else if (fn === '(' || fn === ')') {
    if (fn === '(') {
      displayExpression.value += '( '
    } else {
      displayExpression.value += `${currentInput.value} ) `
      currentInput.value = '0'
    }
  }
}

const clearAll = () => {
  playSound(300, 'square', 0.08)
  triggerKeyHighlight('AC')
  currentInput.value = '0'
  displayExpression.value = ''
  isEvaluated.value = false
}

const backspace = () => {
  playSound(400, 'square')
  triggerKeyHighlight('⌫')
  if (isEvaluated.value) {
    clearAll()
    return
  }

  if (currentInput.value.length > 1) {
    currentInput.value = currentInput.value.slice(0, -1)
  } else {
    currentInput.value = '0'
  }
}

const toggleSign = () => {
  playSound(600, 'sine')
  triggerKeyHighlight('+/-')
  if (currentInput.value !== '0' && currentInput.value !== 'Error') {
    if (currentInput.value.startsWith('-')) {
      currentInput.value = currentInput.value.slice(1)
    } else {
      currentInput.value = '-' + currentInput.value
    }
  }
}

const appendPercent = () => {
  playSound(600, 'sine')
  triggerKeyHighlight('%')
  const val = parseFloat(currentInput.value) || 0
  currentInput.value = (val / 100).toString()
}

// Evaluate Calculation safely
const calculate = () => {
  playSound(850, 'sine', 0.08)
  triggerKeyHighlight('=')

  let rawExpr = displayExpression.value + currentInput.value
  if (!rawExpr.trim()) return

  // Format expression for evaluation
  let evalExpr = rawExpr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, Math.PI.toString())
    .replace(/e/g, Math.E.toString())
    .replace(/\^/g, '**')

  try {
    const safeEval = new Function(`return (${evalExpr})`)
    let result = safeEval()

    if (typeof result === 'number') {
      if (!isFinite(result)) {
        currentInput.value = 'Tidak bisa dibagi 0'
      } else {
        // Fix float precision (e.g. 0.1 + 0.2 = 0.3)
        const precisionResult = Number(Math.round(Number(result + 'e12')) + 'e-12')
        const finalResStr = precisionResult.toString()
        
        // Push to history log
        const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        history.value.unshift({
          id: Date.now().toString(),
          expression: rawExpr,
          result: finalResStr,
          timestamp: timeStr
        })

        lastAnswer.value = finalResStr
        displayExpression.value = `${rawExpr} =`
        currentInput.value = finalResStr
        isEvaluated.value = true
      }
    }
  } catch (err) {
    currentInput.value = 'Sintaks Error'
    isEvaluated.value = true
  }
}

// Highlight visual key on physical keyboard press
const triggerKeyHighlight = (key: string) => {
  activeKey.value = key
  setTimeout(() => {
    if (activeKey.value === key) activeKey.value = null
  }, 150)
}

// Copy result to clipboard
const copyResult = () => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(currentInput.value)
    showToast('Copied to Clipboard! 📋')
  }
}

// Restore from History
const useHistoryItem = (item: HistoryItem) => {
  displayExpression.value = item.expression + ' ='
  currentInput.value = item.result
  isEvaluated.value = true
  showHistory.value = false
  showToast('Memuat dari Riwayat! 🕒')
}

const clearHistory = () => {
  history.value = []
  showToast('Riwayat dibersihkan! 🗑️')
}

// Physical Keyboard Listener
const handleKeyDown = (e: KeyboardEvent) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return

  if (e.key >= '0' && e.key <= '9') {
    appendNumber(e.key)
  } else if (e.key === '.' || e.key === ',') {
    appendDecimal()
  } else if (e.key === '+') {
    appendOperator('+')
  } else if (e.key === '-') {
    appendOperator('-')
  } else if (e.key === '*') {
    appendOperator('×')
  } else if (e.key === '/') {
    e.preventDefault()
    appendOperator('÷')
  } else if (e.key === '%') {
    appendPercent()
  } else if (e.key === 'Enter' || e.key === '=') {
    e.preventDefault()
    calculate()
  } else if (e.key === 'Backspace') {
    backspace()
  } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
    clearAll()
  } else if (e.key === '(' || e.key === ')') {
    appendFunction(e.key)
  } else if (e.key === '^') {
    appendOperator('^')
  }
}

// --- Unit Converter Logic ---
const unitOptions: Record<string, { label: string; rate: number }[]> = {
  length: [
    { label: 'Kilometer (km)', rate: 1000 },
    { label: 'Meter (m)', rate: 1 },
    { label: 'Centimeter (cm)', rate: 0.01 },
    { label: 'Millimeter (mm)', rate: 0.001 },
    { label: 'Miles (mi)', rate: 1609.34 },
    { label: 'Feet (ft)', rate: 0.3048 },
    { label: 'Inches (in)', rate: 0.0254 }
  ],
  weight: [
    { label: 'Kilogram (kg)', rate: 1000 },
    { label: 'Gram (g)', rate: 1 },
    { label: 'Milligram (mg)', rate: 0.001 },
    { label: 'Pound (lbs)', rate: 453.592 },
    { label: 'Ounce (oz)', rate: 28.3495 }
  ]
}

const currentUnitList = computed(() => {
  if (converterCategory.value === 'discount' || converterCategory.value === 'temp') return []
  return unitOptions[converterCategory.value] ?? []
})

const convertedResult = computed(() => {
  if (converterCategory.value === 'discount') {
    const orig = discountPrice.value || 0
    const disc = (orig * (discountPercent.value || 0)) / 100
    const afterDisc = orig - disc
    const tax = (afterDisc * (discountTax.value || 0)) / 100
    const finalPrice = afterDisc + tax
    return {
      discountAmount: disc,
      taxAmount: tax,
      finalPrice: finalPrice
    }
  }

  if (converterCategory.value === 'temp') {
    const val = convertValue.value || 0
    let celsius = val
    if (convertFrom.value === 'F') celsius = (val - 32) * (5 / 9)
    if (convertFrom.value === 'K') celsius = val - 273.15

    let res = celsius
    if (convertTo.value === 'F') res = (celsius * 9 / 5) + 32
    if (convertTo.value === 'K') res = celsius + 273.15
    return res.toFixed(2)
  }

  const list = unitOptions[converterCategory.value]
  if (!list) return 0
  const fromObj = list.find((u) => u.label.includes(convertFrom.value))
  const toObj = list.find((u) => u.label.includes(convertTo.value))
  if (!fromObj || !toObj) return 0
  
  const baseValue = convertValue.value * fromObj.rate
  const res = baseValue / toObj.rate
  return res < 0.0001 ? res.toExponential(4) : res.toLocaleString('id-ID', { maximumFractionDigits: 6 })
})
</script>

<template>
  <div :class="['calc-page', `theme-${theme}`]">
    <!-- Toast Popup -->
    <Transition name="fade">
      <div v-if="toastMessage" class="calc-toast">
        {{ toastMessage }}
      </div>
    </Transition>

    <div class="calc-container glass-card">
      <!-- Header Controls -->
      <header class="calc-header">
        <div class="header-left">
          <h1 class="calc-title">
            <span class="icon">🧮</span> Kalkulator Nusa
          </h1>
        </div>

        <div class="header-actions">
          <!-- Sound Toggle -->
          <button 
            @click="soundEnabled = !soundEnabled" 
            class="icon-btn" 
            :title="soundEnabled ? 'Matikan Suara' : 'Aktifkan Suara'"
          >
            {{ soundEnabled ? '🔊' : '🔇' }}
          </button>

          <!-- History Toggle -->
          <button 
            @click="showHistory = !showHistory" 
            class="icon-btn history-badge-wrapper"
            title="Riwayat Perhitungan"
          >
            📜
            <span v-if="history.length" class="history-badge">{{ history.length }}</span>
          </button>

          <!-- Theme Select -->
          <div class="theme-selector">
            <button 
              @click="theme = 'cyber'" 
              :class="['theme-dot', 'cyber', { active: theme === 'cyber' }]" 
              title="Tema Cyber Neon"
            ></button>
            <button 
              @click="theme = 'emerald'" 
              :class="['theme-dot', 'emerald', { active: theme === 'emerald' }]" 
              title="Tema Emerald Glass"
            ></button>
            <button 
              @click="theme = 'light'" 
              :class="['theme-dot', 'light', { active: theme === 'light' }]" 
              title="Tema Light Minimal"
            ></button>
          </div>
        </div>
      </header>

      <!-- Navigation Mode Tabs -->
      <nav class="calc-tabs">
        <button 
          @click="mode = 'standard'" 
          :class="['tab-btn', { active: mode === 'standard' }]"
        >
          🔢 Standar
        </button>
        <button 
          @click="mode = 'scientific'" 
          :class="['tab-btn', { active: mode === 'scientific' }]"
        >
          🔬 Ilmiah
        </button>
        <button 
          @click="mode = 'converter'" 
          :class="['tab-btn', { active: mode === 'converter' }]"
        >
          ⚖️ Konverter
        </button>
      </nav>

      <!-- CALCULATOR MAIN DISPLAY & KEYPAD -->
      <div v-if="mode === 'standard' || mode === 'scientific'" class="calc-main">
        <!-- Display Box -->
        <div class="calc-display">
          <div class="expression-line">
            <span>{{ displayExpression || '&nbsp;' }}</span>
          </div>

          <div class="result-line">
            <span class="number-display">{{ formatDisplayNumber(currentInput) }}</span>
            <button @click="copyResult" class="copy-btn" title="Salin Hasil">
              📋
            </button>
          </div>

          <!-- Angle Mode indicator for scientific -->
          <div v-if="mode === 'scientific'" class="angle-indicator">
            <button @click="isDeg = !isDeg" class="toggle-deg">
              {{ isDeg ? 'DEG' : 'RAD' }}
            </button>
          </div>
        </div>

        <!-- Scientific Mode Extended Top Row -->
        <div v-if="mode === 'scientific'" class="keypad-scientific-grid">
          <button @click="appendFunction('sin')" :class="['btn-sci', { active: activeKey === 'sin' }]">sin</button>
          <button @click="appendFunction('cos')" :class="['btn-sci', { active: activeKey === 'cos' }]">cos</button>
          <button @click="appendFunction('tan')" :class="['btn-sci', { active: activeKey === 'tan' }]">tan</button>
          <button @click="appendFunction('π')" :class="['btn-sci', { active: activeKey === 'π' }]">π</button>

          <button @click="appendFunction('√')" :class="['btn-sci', { active: activeKey === '√' }]">√x</button>
          <button @click="appendFunction('x²')" :class="['btn-sci', { active: activeKey === 'x²' }]">x²</button>
          <button @click="appendOperator('^')" :class="['btn-sci', { active: activeKey === '^' }]">x^y</button>
          <button @click="appendFunction('e')" :class="['btn-sci', { active: activeKey === 'e' }]">e</button>

          <button @click="appendFunction('log')" :class="['btn-sci', { active: activeKey === 'log' }]">log</button>
          <button @click="appendFunction('ln')" :class="['btn-sci', { active: activeKey === 'ln' }]">ln</button>
          <button @click="appendFunction('(')" :class="['btn-sci', { active: activeKey === '(' }]">(</button>
          <button @click="appendFunction(')')" :class="['btn-sci', { active: activeKey === ')' }]">)</button>
        </div>

        <!-- Standard Keypad Matrix -->
        <div class="keypad-grid">
          <!-- Row 1 -->
          <button @click="clearAll" :class="['btn-action', 'btn-ac', { active: activeKey === 'AC' }]">AC</button>
          <button @click="backspace" :class="['btn-action', { active: activeKey === '⌫' }]">⌫</button>
          <button @click="appendPercent" :class="['btn-action', { active: activeKey === '%' }]">%</button>
          <button @click="appendOperator('÷')" :class="['btn-op', { active: activeKey === '÷' }]">÷</button>

          <!-- Row 2 -->
          <button @click="appendNumber('7')" :class="['btn-num', { active: activeKey === '7' }]">7</button>
          <button @click="appendNumber('8')" :class="['btn-num', { active: activeKey === '8' }]">8</button>
          <button @click="appendNumber('9')" :class="['btn-num', { active: activeKey === '9' }]">9</button>
          <button @click="appendOperator('×')" :class="['btn-op', { active: activeKey === '×' }]">×</button>

          <!-- Row 3 -->
          <button @click="appendNumber('4')" :class="['btn-num', { active: activeKey === '4' }]">4</button>
          <button @click="appendNumber('5')" :class="['btn-num', { active: activeKey === '5' }]">5</button>
          <button @click="appendNumber('6')" :class="['btn-num', { active: activeKey === '6' }]">6</button>
          <button @click="appendOperator('-')" :class="['btn-op', { active: activeKey === '-' }]">-</button>

          <!-- Row 4 -->
          <button @click="appendNumber('1')" :class="['btn-num', { active: activeKey === '1' }]">1</button>
          <button @click="appendNumber('2')" :class="['btn-num', { active: activeKey === '2' }]">2</button>
          <button @click="appendNumber('3')" :class="['btn-num', { active: activeKey === '3' }]">3</button>
          <button @click="appendOperator('+')" :class="['btn-op', { active: activeKey === '+' }]">+</button>

          <!-- Row 5 -->
          <button @click="toggleSign" :class="['btn-num', { active: activeKey === '+/-' }]">±</button>
          <button @click="appendNumber('0')" :class="['btn-num', { active: activeKey === '0' }]">0</button>
          <button @click="appendDecimal" :class="['btn-num', { active: activeKey === '.' }]">,</button>
          <button @click="calculate" :class="['btn-equals', { active: activeKey === '=' }]">=</button>
        </div>
      </div>

      <!-- UNIT & DISCOUNT CONVERTER PANEL -->
      <div v-else-if="mode === 'converter'" class="converter-panel">
        <div class="converter-subtabs">
          <button 
            @click="converterCategory = 'length'; convertFrom='m'; convertTo='km'" 
            :class="['subtab-btn', { active: converterCategory === 'length' }]"
          >📏 Panjang</button>
          <button 
            @click="converterCategory = 'weight'; convertFrom='kg'; convertTo='g'" 
            :class="['subtab-btn', { active: converterCategory === 'weight' }]"
          >⚖️ Berat</button>
          <button 
            @click="converterCategory = 'temp'; convertFrom='C'; convertTo='F'" 
            :class="['subtab-btn', { active: converterCategory === 'temp' }]"
          >🌡️ Suhu</button>
          <button 
            @click="converterCategory = 'discount'" 
            :class="['subtab-btn', { active: converterCategory === 'discount' }]"
          >🏷️ Diskon</button>
        </div>

        <!-- Length / Weight / Temp Converter -->
        <div v-if="converterCategory !== 'discount'" class="converter-body">
          <div class="input-group">
            <label>Jumlah</label>
            <input v-model.number="convertValue" type="number" class="converter-input" />
          </div>

          <div class="conversion-row">
            <div class="select-box">
              <label>Dari</label>
              <select v-if="converterCategory === 'temp'" v-model="convertFrom" class="converter-select">
                <option value="C">Celsius (°C)</option>
                <option value="F">Fahrenheit (°F)</option>
                <option value="K">Kelvin (K)</option>
              </select>
              <select v-else v-model="convertFrom" class="converter-select">
                <option v-for="unit in currentUnitList" :key="unit.label" :value="unit.label.split('(')[1]?.replace(')', '') ?? ''">
                  {{ unit.label }}
                </option>
              </select>
            </div>

            <div class="swap-icon">➔</div>

            <div class="select-box">
              <label>Ke</label>
              <select v-if="converterCategory === 'temp'" v-model="convertTo" class="converter-select">
                <option value="C">Celsius (°C)</option>
                <option value="F">Fahrenheit (°F)</option>
                <option value="K">Kelvin (K)</option>
              </select>
              <select v-else v-model="convertTo" class="converter-select">
                <option v-for="unit in currentUnitList" :key="unit.label" :value="unit.label.split('(')[1]?.replace(')', '') ?? ''">
                  {{ unit.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="converter-result-box glass-inset">
            <div class="result-label">Hasil Konversi</div>
            <div class="result-value">{{ convertedResult }} {{ convertTo }}</div>
          </div>
        </div>

        <!-- Discount Calculator -->
        <div v-else class="discount-body">
          <div class="input-grid">
            <div class="input-group">
              <label>Harga Awal (Rp)</label>
              <input v-model.number="discountPrice" type="number" class="converter-input" />
            </div>
            <div class="input-group">
              <label>Diskon (%)</label>
              <input v-model.number="discountPercent" type="number" min="0" max="100" class="converter-input" />
            </div>
            <div class="input-group">
              <label>Pajak / PPN (%)</label>
              <input v-model.number="discountTax" type="number" min="0" class="converter-input" />
            </div>
          </div>

          <div class="discount-summary glass-inset" v-if="typeof convertedResult === 'object'">
            <div class="summary-item">
              <span>Potongan Diskon:</span>
              <strong class="text-red">Rp {{ convertedResult.discountAmount.toLocaleString('id-ID') }}</strong>
            </div>
            <div class="summary-item">
              <span>Pajak (PPN):</span>
              <strong>Rp {{ convertedResult.taxAmount.toLocaleString('id-ID') }}</strong>
            </div>
            <div class="summary-item total">
              <span>Total Akhir:</span>
              <strong class="text-green">Rp {{ convertedResult.finalPrice.toLocaleString('id-ID') }}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <footer class="calc-footer">
        <span>Gunakan keyboard fisik (0-9, +, -, *, /, Enter, Backspace)</span>
      </footer>
    </div>

    <!-- HISTORY DRAWER SLIDE-OVER -->
    <Transition name="slide-history">
      <div v-if="showHistory" class="history-drawer glass-card">
        <div class="history-header">
          <h3>📜 Riwayat Perhitungan</h3>
          <button @click="showHistory = false" class="close-btn">✕</button>
        </div>

        <div v-if="history.length === 0" class="empty-history">
          Belum ada riwayat perhitungan.
        </div>

        <div v-else class="history-list">
          <div 
            v-for="item in history" 
            :key="item.id" 
            @click="useHistoryItem(item)" 
            class="history-item glass-inset"
          >
            <div class="item-time">{{ item.timestamp }}</div>
            <div class="item-expr">{{ item.expression }}</div>
            <div class="item-res">= {{ item.result }}</div>
          </div>
        </div>

        <div v-if="history.length > 0" class="history-footer">
          <button @click="clearHistory" class="btn-clear-history">
            🗑️ Hapus Riwayat
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ==================== DESIGN SYSTEM & THEMES ==================== */
.calc-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.5rem 1rem;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  transition: background-color 0.4s ease, color 0.4s ease;
  position: relative;
  overflow-x: hidden;
}

/* Theme 1: Cyber Neon */
.theme-cyber {
  background: radial-gradient(circle at top left, #1e1b4b, #0f172a, #090d16);
  color: #f8fafc;
}
.theme-cyber .glass-card {
  background: rgba(30, 27, 75, 0.55);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(124, 58, 237, 0.25);
}
.theme-cyber .glass-inset {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Theme 2: Emerald Glass */
.theme-emerald {
  background: radial-gradient(circle at top right, #064e3b, #022c22, #051a14);
  color: #ecfdf5;
}
.theme-emerald .glass-card {
  background: rgba(6, 78, 59, 0.45);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(16, 185, 129, 0.2);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(16, 185, 129, 0.2);
}
.theme-emerald .glass-inset {
  background: rgba(2, 44, 34, 0.6);
  border: 1px solid rgba(16, 185, 129, 0.15);
}

/* Theme 3: Light Minimal */
.theme-light {
  background: linear-gradient(135deg, #e0e7ff 0%, #f1f5f9 100%);
  color: #0f172a;
}
.theme-light .glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08), 0 10px 20px rgba(99, 102, 241, 0.1);
}
.theme-light .glass-inset {
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.8);
}

/* ==================== LAYOUT CONTAINER ==================== */
.calc-container {
  width: 100%;
  max-width: 440px;
  border-radius: 28px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  position: relative;
  z-index: 10;
}

/* Toast */
.calc-toast {
  position: fixed;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #6366f1;
  color: #ffffff;
  padding: 0.6rem 1.4rem;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4);
  z-index: 100;
}

/* Header */
.calc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.calc-title {
  font-size: 1.2rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.icon-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  font-size: 1rem;
  transition: transform 0.2s, background 0.2s;
}
.theme-light .icon-btn {
  background: rgba(0, 0, 0, 0.05);
}
.icon-btn:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.2);
}
.history-badge-wrapper {
  position: relative;
}
.history-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ef4444;
  color: white;
  font-size: 0.65rem;
  font-weight: 800;
  border-radius: 999px;
  padding: 2px 5px;
}

/* Theme Switcher Dots */
.theme-selector {
  display: flex;
  gap: 4px;
  background: rgba(0, 0, 0, 0.15);
  padding: 4px;
  border-radius: 999px;
}
.theme-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: transform 0.2s;
}
.theme-dot.cyber { background: #8b5cf6; }
.theme-dot.emerald { background: #10b981; }
.theme-dot.light { background: #64748b; }
.theme-dot.active {
  transform: scale(1.3);
  box-shadow: 0 0 8px currentColor;
}

/* Navigation Mode Tabs */
.calc-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px;
  border-radius: 16px;
  gap: 4px;
}
.theme-light .calc-tabs {
  background: rgba(0, 0, 0, 0.06);
}
.tab-btn {
  flex: 1;
  padding: 0.5rem;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s ease;
  opacity: 0.7;
}
.tab-btn.active {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.theme-light .tab-btn.active {
  background: #ffffff;
  color: #4f46e5;
}

/* ==================== DISPLAY AREA ==================== */
.calc-display {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 20px;
  padding: 1.25rem 1rem 0.8rem;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  min-height: 100px;
}
.theme-light .calc-display {
  background: rgba(248, 250, 252, 0.9);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(203, 213, 225, 0.6);
}

.expression-line {
  font-size: 0.95rem;
  opacity: 0.65;
  min-height: 1.4rem;
  word-break: break-all;
  text-align: right;
  font-weight: 500;
}
.result-line {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 0.5rem;
}
.number-display {
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  word-break: break-all;
  text-align: right;
  flex: 1;
  line-height: 1.1;
}
.copy-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.5;
  font-size: 1.1rem;
  transition: opacity 0.2s, transform 0.2s;
  padding: 2px;
}
.copy-btn:hover {
  opacity: 1;
  transform: scale(1.15);
}

.angle-indicator {
  position: absolute;
  top: 8px;
  left: 12px;
}
.toggle-deg {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
}

/* ==================== KEYPAD MATRIX ==================== */
.keypad-scientific-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}
.btn-sci {
  padding: 0.5rem 0.2rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}
.theme-light .btn-sci {
  background: rgba(241, 245, 249, 0.8);
}
.btn-sci:hover, .btn-sci.active {
  background: rgba(124, 58, 237, 0.3);
  transform: translateY(-1px);
}

.keypad-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 0.75rem;
}

button {
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.btn-num, .btn-op, .btn-action, .btn-equals {
  height: 58px;
  border-radius: 18px;
  border: none;
  font-size: 1.3rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

/* Button Colors per Theme */
.btn-num {
  background: rgba(255, 255, 255, 0.09);
  color: inherit;
}
.theme-light .btn-num {
  background: #ffffff;
  color: #1e293b;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}
.btn-num:hover, .btn-num.active {
  background: rgba(255, 255, 255, 0.22);
  transform: translateY(-2px);
}

.btn-action {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}
.theme-light .btn-action {
  background: #fee2e2;
  color: #dc2626;
}
.btn-ac {
  font-weight: 700;
  font-size: 1.1rem;
}
.btn-action:hover, .btn-action.active {
  background: rgba(239, 68, 68, 0.3);
  transform: translateY(-2px);
}

.btn-op {
  background: rgba(99, 102, 241, 0.25);
  color: #a5b4fc;
  font-size: 1.5rem;
}
.theme-emerald .btn-op {
  background: rgba(16, 185, 129, 0.25);
  color: #6ee7b7;
}
.theme-light .btn-op {
  background: #e0e7ff;
  color: #4338ca;
}
.btn-op:hover, .btn-op.active {
  background: rgba(99, 102, 241, 0.45);
  transform: translateY(-2px);
}

.btn-equals {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
  font-size: 1.6rem;
}
.theme-emerald .btn-equals {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);
}
.btn-equals:hover, .btn-equals.active {
  transform: translateY(-3px) scale(1.02);
  filter: brightness(1.15);
}

/* ==================== CONVERTER PANEL ==================== */
.converter-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.converter-subtabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.subtab-btn {
  padding: 0.4rem 0.8rem;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.theme-light .subtab-btn {
  background: rgba(0, 0, 0, 0.05);
}
.subtab-btn.active {
  background: #6366f1;
  color: white;
}

.converter-body, .discount-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.input-group label {
  font-size: 0.8rem;
  opacity: 0.75;
  font-weight: 600;
}
.converter-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  font-size: 1.1rem;
  font-weight: 600;
  outline: none;
}
.theme-light .converter-input {
  background: #ffffff;
  border: 1px solid #cbd5e1;
}

.conversion-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.select-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.select-box label {
  font-size: 0.8rem;
  opacity: 0.75;
}
.converter-select {
  width: 100%;
  padding: 0.65rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(15, 23, 42, 0.8);
  color: inherit;
  font-size: 0.85rem;
  outline: none;
}
.theme-light .converter-select {
  background: #ffffff;
  color: #0f172a;
}
.swap-icon {
  margin-top: 1rem;
  font-size: 1.2rem;
  opacity: 0.6;
}

.converter-result-box {
  padding: 1.25rem;
  border-radius: 18px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.result-label {
  font-size: 0.8rem;
  opacity: 0.7;
}
.result-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #818cf8;
}
.theme-emerald .result-value { color: #34d399; }
.theme-light .result-value { color: #4f46e5; }

.input-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.discount-summary {
  padding: 1rem;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.summary-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}
.summary-item.total {
  border-top: 1px dashed rgba(255, 255, 255, 0.2);
  padding-top: 0.6rem;
  font-size: 1.1rem;
}
.text-red { color: #f87171; }
.text-green { color: #4ade80; }

/* Footer */
.calc-footer {
  text-align: center;
  font-size: 0.72rem;
  opacity: 0.5;
  margin-top: 0.25rem;
}

/* ==================== HISTORY DRAWER ==================== */
.history-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 440px;
  z-index: 50;
  border-radius: 28px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}
.close-btn:hover { opacity: 1; }

.empty-history {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0.5;
  font-size: 0.9rem;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 4px;
}
.history-item {
  padding: 0.85rem 1rem;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
}
.history-item:hover {
  transform: translateX(-3px);
  background: rgba(255, 255, 255, 0.15);
}
.item-time {
  font-size: 0.7rem;
  opacity: 0.5;
}
.item-expr {
  font-size: 0.85rem;
  opacity: 0.8;
}
.item-res {
  font-size: 1.1rem;
  font-weight: 700;
  color: #a5b4fc;
}

.history-footer {
  text-align: center;
}
.btn-clear-history {
  width: 100%;
  padding: 0.6rem;
  border-radius: 12px;
  border: none;
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-clear-history:hover {
  background: rgba(239, 68, 68, 0.35);
}

/* Animations */
.slide-history-enter-active, .slide-history-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-history-enter-from, .slide-history-leave-to {
  transform: translateX(100%);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>

import dotenv from 'dotenv'
import { type Candle, type Instrument, RestClient } from 'okx-api'
import { OpenAI } from 'openai'
import { tasks, text, log, intro, outro, spinner, stream, select } from '@clack/prompts'
import kleur from 'kleur'
import * as ta from 'technicalindicators'
import * as fs from 'fs'
dotenv.config()

const OPEN_AI_BASE_URL = process.env.OPEN_AI_BASE_URL || 'https://api.openai.com'
const OPEN_AI_MODEL = process.env.OPEN_AI_MODEL || 'gpt-5'
const OPEN_AI_API_KEY = process.env.OPEN_AI_API_KEY

const DATA_LIMIT:number = 20
// const OKX_API_KEY = process.env.OKX_API_KEY
// const OKX_API_SECRET = process.env.OKX_API_SECRET
// const OKX_API_PASSPHRASE = process.env.OKX_PASSPHRASE

if (!OPEN_AI_API_KEY) {
  console.error('OPEN_AI_API_KEY is not set')
  process.exit(1)
}

const openai = new OpenAI({
  baseURL: OPEN_AI_BASE_URL,
  apiKey: OPEN_AI_API_KEY,
})

const okx = new RestClient()

const spin = spinner()

const prompts = await fs.readdirSync('prompts');

if(prompts.length === 0) {
  console.error('No prompts found in prompts directory')
  process.exit(1)
}

let spot: Instrument[] = []
let swap: Instrument[] = []

console.clear()
intro(`Crypto AI Trader`)
spin.start('Loading OKX Instruments...')
spot = await okx.getInstruments({
  instType: 'SPOT',
})
swap = await okx.getInstruments({
  instType: 'SWAP',
})

spin.stop(
  `Loaded ${kleur.green(spot.length)} SPOT Instruments and ${kleur.green(swap.length)} SWAP Instruments From OKX`
)

const symbol = (await text({
  message: 'Enter a symbol',
  placeholder: 'BTC-USDT-SWAP',
  initialValue: 'BTC-USDT-SWAP',
  validate(value: string) {
    if (!value) {
      return 'Enter a symbol:'
    }

    if (
      !spot.some((inst) => inst.instId === value) &&
      !swap.some((inst) => inst.instId === value)
    ) {
      return 'Symbol not found'
    }
  },
})) as string

const timeframes: any = {
  '15m': {},
  '1H': {},
}

let markPrice: number = 0

const parseCandles = (candles: Candle[]) => {
  const open: number[] = []
  const low: number[] = []
  const high: number[] = []
  const close: number[] = []
  const volume: number[] = []

  for (let i = candles.length - 1; i >= 0; i--) {
    let candle = candles[i]
    if (candle[8] === '1') {
      open.push(Number(candle[1]))
      low.push(Number(candle[3]))
      high.push(Number(candle[2]))
      close.push(Number(candle[4]))
      volume.push(Number(candle[5]))
    }
  }
  return {
    open,
    low,
    high,
    close,
    volume,
  }
}

function compactTimeframeData(tf: string) {
  timeframes[tf].open = timeframes[tf].open.slice(-DATA_LIMIT)
  timeframes[tf].low = timeframes[tf].low.slice(-DATA_LIMIT)
  timeframes[tf].high = timeframes[tf].high.slice(-DATA_LIMIT)
  timeframes[tf].close = timeframes[tf].close.slice(-DATA_LIMIT)
  timeframes[tf].volume = timeframes[tf].volume.slice(-DATA_LIMIT)
}

const modelResponse = await tasks([
  {
    title: 'Loading Market data...',
    task: async () => {
      const date = new Date()
      const timestamp = date.getTime()

      let [tf15m, tf1H] = await Promise.all([
        okx.getCandles({
          instId: symbol,
          bar: '15m',
          after: `${timestamp}`,
          limit: '200',
        }),
        okx.getCandles({
          instId: symbol,
          bar: '1H',
          after: `${timestamp}`,
          limit: '200',
        }),
      ])
      const markPrice: string = (
        await okx.getMarkPrice({
          instType: 'SWAP',
          instId: symbol,
        })
      )?.[0]?.markPx

      timeframes['symbol'] = symbol
      timeframes['markPrice'] = +markPrice
      timeframes['datetime'] = date.toISOString()
      timeframes['15m'] = parseCandles(tf15m)
      timeframes['1H'] = parseCandles(tf1H)

      return 'Done loading OHLCV data'
    },
  },
  {
    title: 'Calculating indicators...',
    task: async () => {
      const tf15mEma20 = ta.ema({
        values: timeframes['15m'].close,
        period: 20,
      })

      const tf1HEma20 = ta.ema({
        values: timeframes['1H'].close,
        period: 20,
      })

      const tf15mATR = ta.atr({
        high: timeframes['15m'].high,
        low: timeframes['15m'].low,
        close: timeframes['15m'].close,
        period: 14,
      })

      const tf1HATR = ta.atr({
        high: timeframes['1H'].high,
        low: timeframes['1H'].low,
        close: timeframes['1H'].close,
        period: 14,
      })

      timeframes['15m'].ema20 = tf15mEma20.slice(-DATA_LIMIT)
      timeframes['1H'].ema20 = tf1HEma20.slice(-DATA_LIMIT)
      timeframes['15m'].atr = tf15mATR.slice(-DATA_LIMIT)
      timeframes['1H'].atr = tf1HATR.slice(-DATA_LIMIT)

      compactTimeframeData('15m')
      compactTimeframeData('1H')
      return 'Done calculating indicators'
    },
  },
])

const promptFileName = await select({
  message: 'Select your system prompt.',
  options: prompts.map((prompt) => {
    const [filename,_] = prompt.split('.')
    return {value: prompt, label: filename}
  })
}) as string;

const systemPrompt = fs.readFileSync(`prompts/${promptFileName}`, 'utf-8')

const response = await openai.chat.completions.create({
  model: OPEN_AI_MODEL,
  messages: [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: JSON.stringify(timeframes),
    }
  ],
  stream: true,
  temperature: 0,
  response_format: {
    type: 'json_object',
  },
  max_tokens: 10000
})

let plan: string = ''


log.message('Reasoning...',)

const iterable = (async function* () {

  for await (const chunk of response) {
    if (chunk.choices[0]?.delta?.content) {
      plan += chunk.choices[0].delta.content
    } else {
      const reasoningChunk = ((chunk.choices[0]?.delta as any)?.reasoning_content) as string
      yield reasoningChunk || ''
    }
  }
})()

await stream.info(iterable)

console.table(JSON.parse(plan))

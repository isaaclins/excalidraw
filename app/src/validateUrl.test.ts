import { describe, it, expect } from 'vitest'
import { validateHttpsUrl } from './validateUrl'

describe('validateHttpsUrl', () => {
  it('rejects empty', () => {
    expect(validateHttpsUrl('')).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects non-https', () => {
    expect(validateHttpsUrl('http://example.com')).toEqual({ ok: false, reason: 'not_https' })
  })

  it('rejects invalid', () => {
    expect(validateHttpsUrl('not a url')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('accepts https', () => {
    expect(validateHttpsUrl('https://example.com')).toEqual({ ok: true })
  })
})



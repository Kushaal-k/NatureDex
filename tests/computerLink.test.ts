import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computerLink } from '../src/computerLink';

test('private computer link preserves pairing fragment', () => {
  assert.equal(computerLink(' https://my-laptop.trycloudflare.com/#pair=private-code ', 'https://naturedex.onrender.com'), 'https://my-laptop.trycloudflare.com/#pair=private-code');
});

test('computer links reject insecure schemes, embedded credentials and the static site itself', () => {
  for (const link of ['javascript:alert(1)', 'http://127.0.0.1:8000', 'https://user:password@example.com', 'not a link', 'https://naturedex.onrender.com/#pair=code']) {
    assert.throws(() => computerLink(link, 'https://naturedex.onrender.com'));
  }
});

/* 타이틀 → 문장: 타이틀의 큰 ● 가 초록 색면으로 화면을 덮고, 이 장의 작은 ● 로 접힌다 */
Deck.cut('sentence', { from: 'title', kind: 'cover', a: '.t-agent', b: '.r-ai', color: '#00854A', t1: 400, t2: 560 });

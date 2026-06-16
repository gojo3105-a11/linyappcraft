import { useEffect } from 'react';
import LinyDoryGame from './LinyDoryGame';
import DailyReward from './DailyReward';
import { fetchUserKey } from './toss';
import { setScope } from './store';

export default function App() {
  // 토스 익명키로 저장 스코프를 계정별로 분리 (없으면 게스트)
  useEffect(() => {
    let alive = true;
    fetchUserKey().then(key => { if (alive && key) setScope(key); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <DailyReward />
      <LinyDoryGame />
    </>
  );
}

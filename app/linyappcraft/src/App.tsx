import { useEffect } from 'react';
import LinyDoryGame from './LinyDoryGame';
import DailyReward from './DailyReward';
import { initAccount } from './auth';
import { GIconDefs } from './ui';

export default function App() {
  // 저장된 로그인 상태 복원(없으면 게스트) → 계정별 저장 스코프 설정
  useEffect(() => { initAccount(); }, []);

  return (
    <>
      <GIconDefs />
      <DailyReward />
      <LinyDoryGame />
    </>
  );
}

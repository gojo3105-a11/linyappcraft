import { useState } from 'react';
import AniPangGame from './AniPangGame';
import HedgehogGame from './HedgehogGame';
import DailyReward from './DailyReward';

export default function App() {
  const [game, setGame] = useState<'anipang' | 'hedgehog'>('anipang');
  return (
    <>
      <DailyReward />
      {game === 'anipang'
        ? <AniPangGame onSwitchGame={() => setGame('hedgehog')} />
        : <HedgehogGame onSwitchGame={() => setGame('anipang')} />
      }
    </>
  );
}

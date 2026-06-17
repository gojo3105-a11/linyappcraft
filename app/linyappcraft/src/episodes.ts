// 리니와도리 유튜브 애니메이션 에피소드 목록.
//
// videoId = 유튜브 영상 ID(주소에서 11자리).
//   예) https://youtu.be/AbcDef12345        → 'AbcDef12345'
//       https://www.youtube.com/watch?v=AbcDef12345 → 'AbcDef12345'
//   videoId 를 채우면 썸네일·재생이 자동으로 연결돼요. (비워두면 '곧 공개'로 표시)
export interface Episode {
  ep: number;        // 화수
  title: string;     // 제목
  videoId: string;   // 유튜브 영상 ID (없으면 '')
  desc?: string;     // 짧은 설명
}

export const EPISODES: Episode[] = [
  { ep: 1, title: '리니와 도리의 첫 만남', videoId: '', desc: '가시 숲에서 시작되는 두 친구의 이야기' },
  { ep: 2, title: '가시소동 대작전',       videoId: '', desc: '' },
  { ep: 3, title: '솔방울을 찾아서',       videoId: '', desc: '' },
  { ep: 4, title: '비밀의 동굴',           videoId: '', desc: '' },
];

export const ytThumb = (videoId: string) => `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
export const ytEmbed = (videoId: string) => `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
export const ytWatch = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

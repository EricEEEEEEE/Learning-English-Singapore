export function GuideIcon({ name }: { name: 'back' | 'pause' | 'finish' | 'help' | 'sound' | 'skip' | 'next' }) {
  const paths = {
    back: 'M19 12H5m6-6-6 6 6 6', pause: 'M8 5v14M16 5v14', finish: 'M5 5h14v14H5Z',
    help: 'M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 4v1', sound: 'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8',
    skip: 'm6 5 8 7-8 7M18 5v14', next: 'M5 12h14m-6-6 6 6-6 6',
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function ChoiceIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    coffee: 'M10 21h23v9c0 7-23 7-23 0V21Zm23 1h3a5 5 0 0 1 0 10h-3M12 39h24M18 16c-4-4 4-4 0-8M26 16c-4-4 4-4 0-8',
    tea: 'M9 25h28v6c0 10-28 10-28 0v-6ZM24 21C12 21 13 7 13 7c14 0 18 8 11 14ZM16 10l8 11',
    water: 'M24 6S11 21 11 29a13 13 0 0 0 26 0C37 21 24 6 24 6ZM17 29c0 4 2 7 6 7',
    wave: 'M15 31V16a3 3 0 0 1 6 0v10-16a3 3 0 0 1 6 0v16-12a3 3 0 0 1 6 0v14-8a3 3 0 0 1 6 0v12c0 14-17 16-22 7L9 28c-2-4 2-6 4-3l5 5M4 13l4 3M9 5l3 4',
    enter: 'M24 6h16v36H24M5 24h26m-8-8 8 8-8 8',
    leave: 'M8 6h16v36H8M20 24h24m-8-8 8 8-8 8',
    wait: 'M24 7a17 17 0 1 0 0 34 17 17 0 0 0 0-34ZM24 14v11h10',
    take: 'M20 8h16v14H20ZM8 31l10-5 12 1c5 0 4 5 0 5h-8m-14 7 13 3 19-13c4-3 0-7-3-5l-7 4',
    here: 'M24 43S10 28 10 19a14 14 0 0 1 28 0c0 9-14 24-14 24ZM29 19a5 5 0 1 0-10 0 5 5 0 0 0 10 0Z',
    upstairs: 'M6 41h10V31h10V21h10V11h7M8 25 26 7m-11 0h11v11',
    outside: 'M6 42V10h22v32M12 16h4m5 0h3m-12 8h4m5 0h3M29 33h15m-6-6 6 6-6 6',
    left: 'M41 24H7m14-14L7 24l14 14', right: 'M7 24h34M27 10l14 14-14 14', straight: 'M24 41V7M10 21 24 7l14 14',
    school: 'M5 20 24 7l19 13M9 18v23h30V18M20 41V29h8v12M18 20h12',
    work: 'M7 17h34v23H7ZM17 17V9h14v8M7 27h34M21 25v5h6v-5',
    daily: 'M5 23 24 7l19 16M10 20v22h28V20M21 42V29h7v13',
    own: 'M8 8h32v25H22L10 42v-9H8ZM15 16h18M15 23h12',
    speak: 'M8 9h32v23H24L13 41v-9H8ZM14 20h20', quiet: 'M10 14h12l8-6v32l-8-6H10ZM36 17v14', listen: 'M17 16a9 9 0 0 1 18 0c0 7-8 9-8 15 0 10-14 10-14 2m9-17a4 4 0 0 1 8 0c0 5-7 5-7 10',
    short: 'M24 7a17 17 0 1 0 0 34 17 17 0 0 0 0-34ZM24 12v12l8-4',
    medium: 'M24 7a17 17 0 1 0 0 34 17 17 0 0 0 0-34ZM24 12v12l12 3',
    long: 'M7 26c0-14 12-14 17 0s17 14 17 0-12-14-17 0S7 40 7 26Z',
    show: 'M8 8h32v27H8ZM19 16l12 6-12 6V16ZM24 35v8m-8 0h16',
    twoChoices: 'M6 11h14v26H6ZM28 11h14v26H28ZM11 23l3 3 4-7M32 23h6',
    cancel: 'M8 11h32v30H8ZM8 20h32M15 6v10M33 6v10m-15 9 12 12m0-12L18 37',
    move: 'M8 11h32v30H8ZM8 20h32M15 6v10M33 6v10M13 30h21m-6-6 6 6-6 6',
    confirm: 'M8 11h32v30H8ZM8 20h32M15 6v10M33 6v10M15 30l6 6 12-12',
    cannot: 'M24 7a17 17 0 1 0 0 34 17 17 0 0 0 0-34ZM12 12l24 24',
    repeat: 'M38 18A15 15 0 1 0 38 32M38 7v12H26',
    ready: 'M24 7a17 17 0 1 0 0 34 17 17 0 0 0 0-34ZM14 25l7 7 14-16',
    slow: 'M11 20h26v18H11ZM5 35h6m26 0h6M16 20V9m8 11V5m8 15V9M17 38v5m14-5v5',
    anotherWay: 'M8 12h25l-6-6m6 6-6 6M40 36H15l6-6m-6 6 6 6M8 12v15m32 9V21',
    tomorrow: 'M8 11h32v30H8ZM8 20h32M15 6v10M33 6v10M14 30h19m-6-6 6 6-6 6',
    new: 'M18 16a9 9 0 0 1 18 0c0 7-8 9-8 15 0 8-12 9-13 2M7 25h5',
    words: 'M8 10h32v24H24L13 42v-8H8ZM15 21h5m8 0h5',
    simple: 'M6 7h30v23H22L12 38v-8H6ZM36 19h6v23H25',
    natural: 'M6 7h30v23H22L12 38v-8H6ZM36 19h6v23H25M12 15h18M12 22h13',
  };
  const time = ['morning', 'noon', 'evening', 'afternoon'].includes(name);
  const cups = name === 'one' ? 1 : name === 'two' ? 2 : name === 'three' ? 3 : 0;
  const sequence = name === 'waitThenEnter' || name === 'enterThenWait';
  return (
    <svg className="choice-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {time ? <><circle cx="24" cy="24" r="17" /><path d={name === 'morning' ? 'M24 10v14H12' : name === 'noon' ? 'M24 10v14' : name === 'afternoon' ? 'M24 10v14h12' : 'M24 10v14l-9 10'} /></> : cups ? (
        Array.from({ length: cups }, (_, i) => <path key={i} d="M0 0h10v12c0 5-10 5-10 0V0Zm10 2h3v7h-3" transform={`translate(${cups === 1 ? 18 : cups === 2 ? 9 + i * 17 : 1 + i * 16} 17)`} />)
      ) : sequence ? <><path d="M4 24h40m-6-6 6 6-6 6M9 10h10v9H9Zm20 20h10v10H29Z" /><path d={name === 'waitThenEnter' ? 'M13 11v5h4M34 33v5m-3-2h6' : 'M14 12v5m-3-2h6M33 32v5h4'} /></> : <path d={paths[name]} />}
    </svg>
  );
}

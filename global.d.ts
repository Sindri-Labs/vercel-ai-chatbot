declare global {
  var process: {
    env: {
      [key: string]: string | undefined;
    };
    exit: (code?: number) => never;
  };
}

export {}; 
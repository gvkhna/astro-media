/// <reference types="astro/client" />

interface ImportMetaEnv {
    readonly PUBLIC_GRPC_HOSTNAME: string;
    readonly PUBLIC_WEB_HOSTNAME: string;
    // more env variables...
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
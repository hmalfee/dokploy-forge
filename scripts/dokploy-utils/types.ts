export interface ComposeSpecification {
  services?: Record<string, DefinitionsService>;
  networks?: Record<string, any>;
  volumes?: Record<string, any>;
  secrets?: Record<string, any>;
  configs?: Record<string, any>;
  [k: string]: any;
}

export interface DefinitionsService {
  container_name?: string;
  image?: string;
  networks?: string[] | Record<string, any>;
  ports?: (
    | number
    | string
    | {
        target?: number;
        published?: string | number;
        mode?: string;
        host_ip?: string;
        protocol?: string;
      }
  )[];
  volumes?: any[];
  environment?: string[] | Record<string, string | number | null>;
  env_file?: string | string[];
  depends_on?: string[] | Record<string, any>;
  deploy?: any;
  command?: string | string[];
  entrypoint?: string | string[];
  [k: string]: any;
}

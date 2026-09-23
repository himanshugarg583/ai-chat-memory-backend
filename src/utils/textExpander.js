/**
 * Text expansion utilities for better embedding matching
 * Pure functions - no I/O
 */

// Common abbreviation map for tech terms
const ABBREVIATION_MAP = {
  db: 'database',
  dbs: 'databases',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  pg: 'postgresql',
  postgres: 'postgresql',
  k8s: 'kubernetes',
  tf: 'terraform',
  aws: 'amazon web services',
  gcp: 'google cloud platform',
  api: 'application programming interface',
  apis: 'application programming interfaces',
  ui: 'user interface',
  ux: 'user experience',
  fe: 'frontend',
  be: 'backend',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  ci: 'continuous integration',
  cd: 'continuous deployment',
  devops: 'development operations',
  auth: 'authentication',
  oauth: 'open authentication',
  jwt: 'json web token',
  sql: 'structured query language',
  nosql: 'non relational database',
  orm: 'object relational mapping',
  cli: 'command line interface',
  sdk: 'software development kit',
  ide: 'integrated development environment',
  vsc: 'visual studio code',
  vscode: 'visual studio code',
  npm: 'node package manager',
  pnpm: 'performant node package manager',
  css: 'cascading style sheets',
  html: 'hypertext markup language',
  json: 'javascript object notation',
  yaml: 'yaml markup language',
  xml: 'extensible markup language',
  http: 'hypertext transfer protocol',
  https: 'secure hypertext transfer protocol',
  grpc: 'google remote procedure call',
  rest: 'representational state transfer',
  graphql: 'graph query language',
  ws: 'websocket',
  wss: 'secure websocket',
  redis: 'redis database',
  mongo: 'mongodb',
  mysql: 'mysql database',
  mssql: 'microsoft sql server',
  neo4j: 'neo4j graph database',
  docker: 'docker container',
  ecs: 'elastic container service',
  eks: 'elastic kubernetes service',
  aks: 'azure kubernetes service',
  gke: 'google kubernetes engine',
  ec2: 'elastic compute cloud',
  s3: 'simple storage service',
  rds: 'relational database service',
  lambda: 'aws lambda serverless',
  sqs: 'simple queue service',
  sns: 'simple notification service',
  dlq: 'dead letter queue',
  vm: 'virtual machine',
  vms: 'virtual machines',
  os: 'operating system',
  linux: 'linux operating system',
  ubuntu: 'ubuntu linux',
  centos: 'centos linux',
  macos: 'apple macos',
  win: 'windows',
  pwa: 'progressive web app',
  spa: 'single page application',
  ssr: 'server side rendering',
  ssg: 'static site generation',
  csr: 'client side rendering',
  cdn: 'content delivery network',
  dns: 'domain name system',
  ssl: 'secure sockets layer',
  tls: 'transport layer security',
  cors: 'cross origin resource sharing',
  csrf: 'cross site request forgery',
  xss: 'cross site scripting',
  ddos: 'distributed denial of service',
  ip: 'internet protocol',
  tcp: 'transmission control protocol',
  udp: 'user datagram protocol',
  ftp: 'file transfer protocol',
  ssh: 'secure shell',
  vpn: 'virtual private network',
  vpc: 'virtual private cloud',
  iam: 'identity and access management',
  rbac: 'role based access control',
  ldap: 'lightweight directory access protocol',
  saml: 'security assertion markup language',
  sso: 'single sign on',
  mfa: '2fa multi factor authentication',
  otp: 'one time password',
  totp: 'time based one time password',
  saas: 'software as a service',
  paas: 'platform as a service',
  iaas: 'infrastructure as a service',
  baas: 'backend as a service',
  faas: 'function as a service',
  cms: 'content management system',
  crm: 'customer relationship management',
  erp: 'enterprise resource planning',
  bi: 'business intelligence',
  etl: 'extract transform load',
  elt: 'extract load transform',
  olap: 'online analytical processing',
  oltp: 'online transaction processing',
  dwh: 'data warehouse',
  mvp: 'minimum viable product',
  poc: 'proof of concept',
  tdd: 'test driven development',
  bdd: 'behavior driven development',
  ddd: 'domain driven design',
  solid: 'solid principles',
  dry: 'dont repeat yourself',
  kiss: 'keep it simple stupid',
  yagni: 'you arent gonna need it',
  agile: 'agile methodology',
  scrum: 'scrum methodology',
  kanban: 'kanban methodology',
  qa: 'quality assurance',
  uat: 'user acceptance testing',
  e2e: 'end to end testing',
  ut: 'unit testing',
  regex: 'regular expression',
  regexp: 'regular expression',
};

/**
 * Expand abbreviations in text for better semantic matching
 * @param {string} text - Input text
 * @returns {string} - Text with abbreviations expanded
 */
export const expandAbbreviations = (text) => {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Split into words, preserving punctuation attached to words
  const words = text.split(/\s+/);
  
  const expanded = words.map(word => {
    // Extract the core word (remove leading/trailing punctuation)
    const match = word.match(/^([^\w]*)([\w]+)([^\w]*)$/);
    if (!match) return word;
    
    const [, prefix, core, suffix] = match;
    const lowerCore = core.toLowerCase();
    
    // Check if this is an abbreviation
    if (ABBREVIATION_MAP[lowerCore]) {
      // Preserve original casing style
      const expansion = ABBREVIATION_MAP[lowerCore];
      return prefix + expansion + suffix;
    }
    
    return word;
  });

  return expanded.join(' ');
};

/**
 * Format memory for embedding: "key_name" becomes "key name: content"
 * @param {string} memoryKey - The memory key (e.g., "primary_database")
 * @param {string} content - The memory content
 * @returns {string} - Formatted text for embedding
 */
export const formatMemoryForEmbedding = (memoryKey, content) => {
  const readableKey = memoryKey.replace(/_/g, ' ');
  return `${readableKey}: ${content}`;
};

export default {
  expandAbbreviations,
  formatMemoryForEmbedding,
  ABBREVIATION_MAP,
};

import { Configuration, FrontendApi, IdentityApi } from '@ory/kratos-client';

const publicUrl = process.env.NEXT_PUBLIC_KRATOS_PUBLIC_URL || 'http://localhost:4433';
const adminUrl = process.env.KRATOS_ADMIN_URL || 'http://localhost:4434';

export const kratosFrontend = new FrontendApi(new Configuration({ basePath: publicUrl }));

export const kratosAdmin = new IdentityApi(new Configuration({ basePath: adminUrl }));

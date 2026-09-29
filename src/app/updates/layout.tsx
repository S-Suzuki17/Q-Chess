import { WebOnlyPage } from '../../components/WebOnlyPage';
import { informationMetadata, informationViewport } from '../../config/siteMetadata';
export const metadata = informationMetadata('QUBEの雑談・開発ノート', '/updates/');
export const viewport = informationViewport;
export default function Layout({ children }: { children: React.ReactNode }) {
    return <WebOnlyPage path="/updates/">{children}</WebOnlyPage>;
}

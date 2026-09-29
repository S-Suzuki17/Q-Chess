import { WebOnlyPage } from '../../components/WebOnlyPage';
import { informationMetadata, informationViewport } from '../../config/siteMetadata';
export const metadata = informationMetadata('遊び方', '/rules/');
export const viewport = informationViewport;
export default function Layout({ children }: { children: React.ReactNode }) {
    return <WebOnlyPage path="/rules/">{children}</WebOnlyPage>;
}

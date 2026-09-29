import { WebOnlyPage } from '../../components/WebOnlyPage';
import { informationMetadata, informationViewport } from '../../config/siteMetadata';
export const metadata = informationMetadata('Q-Gambitについて', '/about/');
export const viewport = informationViewport;
export default function Layout({ children }: { children: React.ReactNode }) {
    return <WebOnlyPage path="/about/">{children}</WebOnlyPage>;
}

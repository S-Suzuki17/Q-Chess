import { WebOnlyPage } from '../../components/WebOnlyPage';
import { informationMetadata, informationViewport } from '../../config/siteMetadata';
export const metadata = informationMetadata('お問い合わせ', '/contact/');
export const viewport = informationViewport;
export default function Layout({ children }: { children: React.ReactNode }) {
    return <WebOnlyPage path="/contact/">{children}</WebOnlyPage>;
}

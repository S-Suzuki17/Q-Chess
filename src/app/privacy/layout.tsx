import { WebOnlyPage } from '../../components/WebOnlyPage';
export default function Layout({ children }: { children: React.ReactNode }) {
    return <WebOnlyPage path="/privacy/">{children}</WebOnlyPage>;
}

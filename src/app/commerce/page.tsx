import { CommercePage } from '../../components/CommercePage';
import { informationMetadata, informationViewport } from '../../config/siteMetadata';
export const metadata = { ...informationMetadata('特定商取引法に基づく表記 / Commercial disclosure', '/commerce/'), robots: { index: false, follow: false } };
export const viewport = informationViewport;
export default function Page() { return <CommercePage/>; }

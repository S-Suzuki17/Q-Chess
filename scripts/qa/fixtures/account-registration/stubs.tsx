import React from 'react';
export default function Link({href,children,...props}:any){return <a href={href} {...props}>{children}</a>;}
export function CommunityFeed(){return null;}

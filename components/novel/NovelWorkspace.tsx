import React from 'react';
import NovelWriter from './NovelWriter';

export type NovelWorkspaceProps = React.ComponentProps<typeof NovelWriter>;

const NovelWorkspace: React.FC<NovelWorkspaceProps> = (props) => (
    <NovelWriter {...props} />
);

export default NovelWorkspace;

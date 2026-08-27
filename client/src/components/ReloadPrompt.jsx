import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button, notification } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { MISIO_COLORS } from '../theme/misioTheme';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  React.useEffect(() => {
    if (needRefresh) {
      notification.info({
        message: '¡Nueva actualización!',
        description: 'Hay una nueva versión de Misio disponible. Actualiza para obtener las últimas mejoras.',
        icon: <SyncOutlined spin style={{ color: MISIO_COLORS.primary }} />,
        duration: 0,
        placement: 'bottomRight',
        key: 'pwa-update',
        btn: (
          <Button
            type="primary"
            size="small"
            onClick={() => updateServiceWorker(true)}
            style={{ backgroundColor: MISIO_COLORS.primary }}
          >
            Actualizar ahora
          </Button>
        ),
        onClose: () => setNeedRefresh(false),
      });
    }
  }, [needRefresh, updateServiceWorker, setNeedRefresh]);

  return null;
}
